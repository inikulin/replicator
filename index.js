// Const
var TRANSFORMED_TYPE_KEY    = '@t';
var CIRCULAR_REF_KEY        = '@r';
var KEY_REQUIRE_ESCAPING_RE = /^#*@(t|r)$/;


// EncodingTransformer
var EncodingTransformer = function (transforms) {
    this.transforms               = transforms;
    this.circularCandidates       = [];
    this.circularCandidatesDescrs = [];
    this.circularRefCount         = 0;
};

EncodingTransformer._createRefObj = function (idx) {
    var obj = {};

    obj[CIRCULAR_REF_KEY] = idx;

    return obj;
};

EncodingTransformer.prototype._applyTransform = function (val, transform) {
    var result          = {};
    var serializableVal = transform.toSerializable(val);

    result[TRANSFORMED_TYPE_KEY] = transform.type;
    result.data                  = this._handleValue(serializableVal, result, 'data');

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
    var circularCandidateIdx = this.circularCandidates.indexOf(obj);

    if (circularCandidateIdx < 0) {
        this.circularCandidates.push(obj);
        this.circularCandidatesDescrs.push({ parent: parent, key: key, refIdx: -1 });

        return Array.isArray(obj) ? this._handleArray(obj) : this._handlePlainObject(obj);
    }

    var descr = this.circularCandidatesDescrs[circularCandidateIdx];

    if (descr.refIdx === -1)
        descr.refIdx = descr.parent ? ++this.circularRefCount : 0;

    return EncodingTransformer._createRefObj(descr.refIdx);
};

EncodingTransformer.prototype._handleValue = function (val, parent, key) {
    var type = typeof val;

    for (var i = 0; i < this.transforms.length; i++) {
        var transform = this.transforms[i];

        if (transform.shouldTransform(type, val))
            return this._applyTransform(val, transform);
    }

    if (type === 'object')
        return this._handleObject(val, parent, key);

    return val;
};

EncodingTransformer.prototype.transform = function (val) {
    var references = [this._handleValue(val, null, null)];

    for (var i = 0; i < this.circularCandidatesDescrs.length; i++) {
        var descr = this.circularCandidatesDescrs[i];

        if (descr.refIdx > 0) {
            references[descr.refIdx] = descr.parent[descr.key];
            descr.parent[descr.key]  = EncodingTransformer._createRefObj(descr.refIdx);
        }
    }

    return references;
};


// Replicator
var Replicator = module.exports = function (serializer) {
    this.transforms = [];
    this.serializer = serializer || JSON;
};

// Manage transforms
Replicator.prototype.addTransform = function (transform) {
    for (var i = 0; i < this.transforms.length; i++) {
        if (this.transforms[i].type === transform.type)
            throw new Error('Transform with type "' + transform.type + '" was already added.');
    }

    this.transforms.push(transform);

    return this;
};

Replicator.prototype.removeTransform = function (transform) {
    var idx = this.transforms.indexOf(transform);

    if (idx > -1)
        this.transforms.splice(idx, 1);

    return this;
};

Replicator.prototype.encode = function (val) {
    var transformer = new EncodingTransformer(this.transforms);
    var transformed = transformer.transform(val);

    return this.serializer.stringify(transformed);
};
