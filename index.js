var Replicator = module.exports = function () {
    this.transforms = [];
    this.serializer = JSON;
};

// Manage transforms
Replicator.prototype.addTransform = function (transform) {
    for (var i = 0; i < this.transforms.length; i++) {
        if (this.transforms[i].name === transform.name)
            throw new Error('Transform with name "' + transform.name + '" was already added.');
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

// Encode
Replicator.prototype._transformArrayToPrimitive = function (arr) {
    var transformed = [];

    for (var i = 0; i < arr.length; i++)
        transformed[i] = this._transformToPrimitive(arr[i]);

    return transformed;
};

Replicator.prototype._transformObjectToPrimitive = function (obj) {
    var transformed = {};

    for (var prop in obj) {
        if (obj.hasOwnProperty(prop))
            transformed[prop] = this._transformToPrimitive(obj[prop]);
    }

    return transformed;
};

Replicator.prototype._transformToPrimitive = function (val) {
    var type = typeof val;

    for (var i = 0; i < this.transforms.length; i++) {
        var transform = this.transforms[i];

        if (transform.shouldTransformToPrimitive(type, val)) {
            var transformed = transform.toPrimitive(val);

            return {
                '@@r-t': transform.name,
                data:    this._transformToPrimitive(transformed)
            };
        }
    }

    if (type === 'object')
        return Array.isArray(val) ? this._transformArrayToPrimitive(val) : this._transformObjectToPrimitive(val);

    return val;
};

Replicator.prototype.encode = function (val) {
    var transformed = this._transformToPrimitive(val);

    return this.serializer.stringify(transformed);
};
