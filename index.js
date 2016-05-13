// Const
var TRANSFORMED_TYPE_KEY    = '@@type';
var KEY_REQUIRE_ESCAPING_RE = /^#*@@type$/;


// EncodingTransformer
var EncodingTransformer = function (transforms) {
    this.transforms = transforms;
};

EncodingTransformer.prototype._handleArray = function (arr) {
    var result = [];

    for (var i = 0; i < arr.length; i++)
        result[i] = this.transform(arr[i]);

    return result;
};

EncodingTransformer.prototype._handleObject = function (obj) {
    var result = {};

    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var resultKey = KEY_REQUIRE_ESCAPING_RE.test(key) ? '#' + key : key;

            result[resultKey] = this.transform(obj[key]);
        }
    }

    return result;
};

EncodingTransformer.prototype.transform = function (val) {
    var type = typeof val;

    for (var i = 0; i < this.transforms.length; i++) {
        var transform = this.transforms[i];

        if (transform.shouldTransform(type, val)) {
            var result       = {};
            var primitiveVal = transform.toPrimitive(val);

            result[TRANSFORMED_TYPE_KEY] = transform.type;
            result.data                  = this.transform(primitiveVal);

            return result;
        }
    }

    if (type === 'object')
        return Array.isArray(val) ? this._handleArray(val) : this._handleObject(val);

    return val;
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
