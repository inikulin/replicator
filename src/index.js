// Const
const TRANSFORMED_TYPE_KEY    = '@t';
const CIRCULAR_REF_KEY        = '@r';
const KEY_REQUIRE_ESCAPING_RE = /^#*@(t|r)$/;

const GLOBAL = (function getGlobal () {
    // NOTE: see http://www.ecma-international.org/ecma-262/6.0/index.html#sec-performeval step 10
    const savedEval = eval;

    return savedEval('this');
})();

const TYPED_ARRAY_CTORS = {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array
};

const ARRAY_BUFFER_SUPPORTED = typeof ArrayBuffer === 'function';
const MAP_SUPPORTED          = typeof Map === 'function';
const SET_SUPPORTED          = typeof Set === 'function';
const TYPED_ARRAY_SUPPORTED  = typeName => typeof TYPED_ARRAY_CTORS[typeName] === 'function'; 

// Saved proto functions
const arrSlice = Array.prototype.slice;

// Default serializer
const JSONSerializer = {
    serialize (val) {
        return JSON.stringify(val);
    },

    deserialize (val) {
        return JSON.parse(val);
    }
};


// EncodingTransformer
class EncodingTransformer {
    constructor (val, transforms) {
        this.references               = val;
        this.transforms               = transforms;
        this.circularCandidates       = [];
        this.circularCandidatesDescrs = [];
        this.circularRefCount         = 0;
    }

    static _createRefMark (idx) {
        const obj = Object.create(null);
    
        obj[CIRCULAR_REF_KEY] = idx;
    
        return obj;
    }

    _createCircularCandidate (val, parent, key) {
        this.circularCandidates.push(val);
        this.circularCandidatesDescrs.push({ parent: parent, key: key, refIdx: -1 });
    }
    
    _applyTransform (val, parent, key, transform) {
        const result          = Object.create(null);
        const serializableVal = transform.toSerializable(val);
    
        if (typeof serializableVal === 'object')
            this._createCircularCandidate(val, parent, key);
    
        result[TRANSFORMED_TYPE_KEY] = transform.type;
        result.data                  = this._handleValue(serializableVal, parent, key);
    
        return result;
    }
    
    _handleArray (arr) {
        const result = [];
    
        for (let i = 0; i < arr.length; i++)
            result[i] = this._handleValue(arr[i], result, i);
    
        return result;
    }
    
    _handlePlainObject (obj) {
        const result           = Object.create(null);
        const ownPropertyNames = Object.getOwnPropertyNames(obj);
    
        for (const key of ownPropertyNames) {
            const resultKey = KEY_REQUIRE_ESCAPING_RE.test(key) ? '#' + key : key;
    
            result[resultKey] = this._handleValue(obj[key], result, resultKey);
        }
    
        return result;
    }
    
    _handleObject (obj, parent, key) {
        this._createCircularCandidate(obj, parent, key);
    
        return Array.isArray(obj) ? this._handleArray(obj) : this._handlePlainObject(obj);
    }
    
    _ensureCircularReference (obj) {
        const circularCandidateIdx = this.circularCandidates.indexOf(obj);
    
        if (circularCandidateIdx > -1) {
            const descr = this.circularCandidatesDescrs[circularCandidateIdx];
    
            if (descr.refIdx === -1)
                descr.refIdx = descr.parent ? ++this.circularRefCount : 0;
    
            return EncodingTransformer._createRefMark(descr.refIdx);
        }
    
        return null;
    }
    
    _handleValue (val, parent, key) {
        const type     = typeof val;
        const isObject = type === 'object' && val !== null;
    
        if (isObject) {
            const refMark = this._ensureCircularReference(val);
    
            if (refMark)
                return refMark;
        }
    
        for (const transform of this.transforms) {    
            if (transform.shouldTransform(type, val))
                return this._applyTransform(val, parent, key, transform);
        }
    
        if (isObject)
            return this._handleObject(val, parent, key);
    
        return val;
    }
    
    transform () {
        const references = [this._handleValue(this.references, null, null)];
    
        for (const descr of this.circularCandidatesDescrs) {    
            if (descr.refIdx > 0) {
                references[descr.refIdx] = descr.parent[descr.key];
                descr.parent[descr.key]  = EncodingTransformer._createRefMark(descr.refIdx);
            }
        }
    
        return references;
    }
}

// DecodingTransform
class DecodingTransformer {
    constructor (references, transformsMap) {
        this.references            = references;
        this.transformMap          = transformsMap;
        this.activeTransformsStack = [];
        this.visitedRefs           = Object.create(null);
    }


    _handlePlainObject (obj) {
        const unescaped        = Object.create(null);
        const ownPropertyNames = Object.getOwnPropertyNames(obj);
    
        for (const key of ownPropertyNames) {
            this._handleValue(obj[key], obj, key);
    
            if (KEY_REQUIRE_ESCAPING_RE.test(key)) {
                // NOTE: use intermediate object to avoid unescaped and escaped keys interference
                // E.g. unescaped "##@t" will be "#@t" which can overwrite escaped "#@t".
                unescaped[key.substring(1)] = obj[key];
                delete obj[key];
            }
        }
        
        for (const key in unescaped)
            obj[key] = unescaped[key];
    }
    
    _handleTransformedObject (obj, parent, key) {
        var transformType = obj[TRANSFORMED_TYPE_KEY];
        var transform     = this.transformMap[transformType];
    
        if (!transform)
            throw new Error('Can\'t find transform for "' + transformType + '" type.');
    
        this.activeTransformsStack.push(obj);
        this._handleValue(obj.data, obj, 'data');
        this.activeTransformsStack.pop();
    
        parent[key] = transform.fromSerializable(obj.data);
    }
    
    _handleCircularSelfRefDuringTransform (refIdx, parent, key) {
        // NOTE: we've hit a hard case: object reference itself during transformation.
        // We can't dereference it since we don't have resulting object yet. And we'll
        // not be able to restore reference lately because we will need to traverse
        // transformed object again and reference might be unreachable or new object contain
        // new circular references. As a workaround we create getter, so once transformation
        // complete, dereferenced property will point to correct transformed object.
        var references = this.references;
        var val = void 0;
    
        Object.defineProperty(parent, key, {
            configurable: true,
            enumerable:   true,
    
            get () {
                if (val === void 0)
                    val = references[refIdx];
    
                return val;
            },
    
            set (value) {
                val = value;
            }
        });
    }
    
    _handleCircularRef (refIdx, parent, key) {
        if (this.activeTransformsStack.indexOf(this.references[refIdx]) > -1)
            this._handleCircularSelfRefDuringTransform(refIdx, parent, key);
    
        else {
            if (!this.visitedRefs[refIdx]) {
                this.visitedRefs[refIdx] = true;
                this._handleValue(this.references[refIdx], this.references, refIdx);
            }
    
            parent[key] = this.references[refIdx];
        }
    }
    
    _handleValue (val, parent, key) {
        if (typeof val !== 'object' || val === null)
            return;
    
        var refIdx = val[CIRCULAR_REF_KEY];
    
        if (refIdx !== void 0)
            this._handleCircularRef(refIdx, parent, key);
    
        else if (val[TRANSFORMED_TYPE_KEY])
            this._handleTransformedObject(val, parent, key);
    
        else if (Array.isArray(val)) {
            for (var i = 0; i < val.length; i++)
                this._handleValue(val[i], val, i);
        }
    
        else
            this._handlePlainObject(val);
    }
    
    transform () {
        this.visitedRefs[0] = true;
        this._handleValue(this.references[0], this.references, 0);
    
        return this.references[0];
    }
}


// Transforms
const builtInTransforms = [
    {
        type: '[[NaN]]',

        shouldTransform (type, val) {
            return type === 'number' && isNaN(val);
        },

        toSerializable () {
            return '';
        },

        fromSerializable () {
            return NaN;
        }
    },

    {
        type: '[[undefined]]',

        shouldTransform (type) {
            return type === 'undefined';
        },

        toSerializable () {
            return '';
        },

        fromSerializable () {
            return void 0;
        }
    },
    {
        type: '[[Date]]',

        shouldTransform (type, val) {
            return val instanceof Date;
        },

        toSerializable (date) {
            return date.getTime();
        },

        fromSerializable (val) {
            var date = new Date();

            date.setTime(val);
            return date;
        }
    },
    {
        type: '[[RegExp]]',

        shouldTransform (type, val) {
            return val instanceof RegExp;
        },

        toSerializable (re) {
            var result = {
                src:   re.source,
                flags: ''
            };

            if (re.global)
                result.flags += 'g';

            if (re.ignoreCase)
                result.flags += 'i';

            if (re.multiline)
                result.flags += 'm';

            return result;
        },

        fromSerializable (val) {
            return new RegExp(val.src, val.flags);
        }
    },

    {
        type: '[[Error]]',

        shouldTransform (type, val) {
            return val instanceof Error;
        },

        toSerializable (err) {
            return {
                name:    err.name,
                message: err.message,
                stack:   err.stack
            };
        },

        fromSerializable (val) {
            var Ctor = GLOBAL[val.name] || Error;
            var err  = new Ctor(val.message);

            err.stack = val.stack;
            return err;
        }
    },

    {
        type: '[[ArrayBuffer]]',

        shouldTransform (type, val) {
            return ARRAY_BUFFER_SUPPORTED && val instanceof ArrayBuffer;
        },

        toSerializable (buffer) {
            var view = new Int8Array(buffer);

            return arrSlice.call(view);
        },

        fromSerializable (val) {
            if (ARRAY_BUFFER_SUPPORTED) {
                var buffer = new ArrayBuffer(val.length);
                var view   = new Int8Array(buffer);

                view.set(val);

                return buffer;
            }

            return val;
        }
    },

    {
        type: '[[TypedArray]]',

        shouldTransform (type, val) {
            for (const [ctorName, ctor] of Object.entries(TYPED_ARRAY_CTORS)) {
                if (TYPED_ARRAY_SUPPORTED(ctorName) && val instanceof ctor)
                    return true;
            }

            return false;
        },

        toSerializable (arr) {
            return {
                ctorName: arr.constructor.name,
                arr:      arrSlice.call(arr)
            };
        },

        fromSerializable (val) {
            return TYPED_ARRAY_SUPPORTED(val.ctorName) ? new TYPED_ARRAY_CTORS[val.ctorName](val.arr) : val.arr;
        }
    },

    {
        type: '[[Map]]',

        shouldTransform (type, val) {
            return MAP_SUPPORTED && val instanceof Map;
        },

        toSerializable (map) {
            var flattenedKVArr = [];

            map.forEach(function (val, key) {
                flattenedKVArr.push(key);
                flattenedKVArr.push(val);
            });

            return flattenedKVArr;
        },

        fromSerializable (val) {
            if (MAP_SUPPORTED) {
                // NOTE: new Map(iterable) is not supported by all browsers
                var map = new Map();

                for (var i = 0; i < val.length; i += 2)
                    map.set(val[i], val[i + 1]);

                return map;
            }

            var kvArr = [];

            for (var j = 0; j < val.length; j += 2)
                kvArr.push([val[i], val[i + 1]]);

            return kvArr;
        }
    },

    {
        type: '[[Set]]',

        shouldTransform (type, val) {
            return SET_SUPPORTED && val instanceof Set;
        },

        toSerializable (set) {
            var arr = [];

            set.forEach(function (val) {
                arr.push(val);
            });

            return arr;
        },

        fromSerializable (val) {
            if (SET_SUPPORTED) {
                // NOTE: new Set(iterable) is not supported by all browsers
                var set = new Set();

                for (var i = 0; i < val.length; i++)
                    set.add(val[i]);

                return set;
            }

            return val;
        }
    }
];

// Replicator
module.exports = class Replicator {
    constructor (serializer) {
        this.transforms    = [];
        this.transformsMap = Object.create(null);
        this.serializer    = serializer || JSONSerializer;
    
        this.addTransforms(builtInTransforms);
    }
    
    // Manage transforms
    addTransforms (transforms) {
        transforms = Array.isArray(transforms) ? transforms : [transforms];
    
        for (var i = 0; i < transforms.length; i++) {
            var transform = transforms[i];
    
            if (this.transformsMap[transform.type])
                throw new Error('Transform with type "' + transform.type + '" was already added.');
    
            this.transforms.push(transform);
            this.transformsMap[transform.type] = transform;
        }
    
        return this;
    }
    
    removeTransforms (transforms) {
        transforms = Array.isArray(transforms) ? transforms : [transforms];
    
        for (var i = 0; i < transforms.length; i++) {
            var transform = transforms[i];
            var idx       = this.transforms.indexOf(transform);
    
            if (idx > -1)
                this.transforms.splice(idx, 1);
    
            delete this.transformsMap[transform.type];
        }
    
        return this;
    }
    
    encode (val) {
        var transformer = new EncodingTransformer(val, this.transforms);
        var references  = transformer.transform();
    
        return this.serializer.serialize(references);
    }
    
    decode (val) {
        var references  = this.serializer.deserialize(val);
        var transformer = new DecodingTransformer(references, this.transformsMap);
    
        return transformer.transform();
    }
};
