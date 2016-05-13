// Const
var TRANSFORMED_TYPE_KEY    = '@t';
var CIRCULAR_REF_KEY        = '@r';
var KEY_REQUIRE_ESCAPING_RE = /^#*@(t|r)$/;


// EncodingTransformer
var EncodingTransformer = function (val, transforms) {
    this.rootVal                  = val;
    this.transforms               = transforms;
    this.circularCandidates       = [];
    this.circularCandidatesDescrs = [];
    this.circularRefCount         = 0;
};

EncodingTransformer._createRefMark = function (idx) {
    var obj = {};

    obj[CIRCULAR_REF_KEY] = idx;

    return obj;
};

EncodingTransformer.prototype._createCircularCandidate = function (val, parent, key) {
    this.circularCandidates.push(val);
    this.circularCandidatesDescrs.push({ parent: parent, key: key, refIdx: -1 });
};

EncodingTransformer.prototype._applyTransform = function (val, parent, key, transform) {
    var result          = {};
    var serializableVal = transform.toSerializable(val);

    if (typeof serializableVal === 'object')
        this._createCircularCandidate(val, parent, key);

    result[TRANSFORMED_TYPE_KEY] = transform.type;
    result.data                  = this._handleValue(serializableVal, parent, key);

    return result;
};

EncodingTransformer.prototype._handleArray = function (arr) {
    var result = [];

    for (var i = 0; i < arr.length; i++)
        result[i] = this._handleValue(arr[i], result, i);

    return result;
};

EncodingTransformer.prototype._handlePlainObject = function (obj) {
    var result = {};

    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var resultKey = KEY_REQUIRE_ESCAPING_RE.test(key) ? '#' + key : key;

            result[resultKey] = this._handleValue(obj[key], result, resultKey);
        }
    }

    return result;
};

EncodingTransformer.prototype._handleObject = function (obj, parent, key) {
    this._createCircularCandidate(obj, parent, key);

    return Array.isArray(obj) ? this._handleArray(obj) : this._handlePlainObject(obj);
};

EncodingTransformer.prototype._ensureCircularReference = function (obj) {
    var circularCandidateIdx = this.circularCandidates.indexOf(obj);

    if (circularCandidateIdx > -1) {
        var descr = this.circularCandidatesDescrs[circularCandidateIdx];

        if (descr.refIdx === -1)
            descr.refIdx = descr.parent ? ++this.circularRefCount : 0;

        return EncodingTransformer._createRefMark(descr.refIdx);
    }

    return null;
};

EncodingTransformer.prototype._handleValue = function (val, parent, key) {
    var type     = typeof val;
    var isObject = type === 'object';

    if (isObject) {
        var refMark = this._ensureCircularReference(val);

        if (refMark)
            return refMark;
    }

    for (var i = 0; i < this.transforms.length; i++) {
        var transform = this.transforms[i];

        if (transform.shouldTransform(type, val))
            return this._applyTransform(val, parent, key, transform);
    }

    if (isObject)
        return this._handleObject(val, parent, key);

    return val;
};

EncodingTransformer.prototype.transform = function () {
    var references = [this._handleValue(this.rootVal, null, null)];

    for (var i = 0; i < this.circularCandidatesDescrs.length; i++) {
        var descr = this.circularCandidatesDescrs[i];

        if (descr.refIdx > 0) {
            references[descr.refIdx] = descr.parent[descr.key];
            descr.parent[descr.key]  = EncodingTransformer._createRefMark(descr.refIdx);
        }
    }

    return references;
};


// Replicator
var Replicator = module.exports = function (serializer) {
    this.transforms    = [];
    this.transformsMap = {};
    this.serializer    = serializer || JSON;
};

// Manage transforms
Replicator.prototype.addTransform = function (transform) {
    if (this.transformsMap[transform.type])
        throw new Error('Transform with type "' + transform.type + '" was already added.');

    this.transforms.push(transform);
    this.transformsMap[transform.type] = transform;

    return this;
};

Replicator.prototype.removeTransform = function (transform) {
    var idx = this.transforms.indexOf(transform);

    if (idx > -1)
        this.transforms.splice(idx, 1);

    delete this.transformsMap[transform.type];

    return this;
};

Replicator.prototype.encode = function (val) {
    var transformer = new EncodingTransformer(val, this.transforms);
    var transformed = transformer.transform();

    return this.serializer.stringify(transformed);
};
