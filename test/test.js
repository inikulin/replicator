var Replicator = require('../');
var assert     = require('assert');

it('Should add and remove transforms', function () {
    var replicator = new Replicator();
    var transform1 = { type: 'transform1' };
    var transform2 = { type: 'transform2' };

    replicator.transforms    = [];
    replicator.transformsMap = {};

    replicator
        .addTransform(transform1)
        .addTransform(transform2);

    assert.deepEqual(replicator.transforms, [transform1, transform2]);

    replicator.removeTransform(transform1);

    assert.deepEqual(replicator.transforms, [transform2]);
});

it('Should raise error if transform already added', function () {
    var replicator = new Replicator();
    var transform  = { type: '42' };

    replicator.addTransform(transform);

    assert.throws(function () {
        replicator.addTransform(transform);
    }, /Transform with type "42" was already added/);
});

describe('Encoding/decoding', function () {
    it('Should encode and restore objects using transforms', function () {
        var replicator = new Replicator();

        replicator.transforms    = [];
        replicator.transformsMap = {};

        var SomeClass = function () {
        };

        SomeClass.prototype.func1 = function () {
            return 'yo1';
        };

        SomeClass.prototype.func2 = function () {
            return 'yo2';
        };

        replicator
            .addTransform([
                {
                    type: 'SomeClass',

                    shouldTransform: function (type, val) {
                        return val instanceof SomeClass;
                    },

                    toSerializable: function (val) {
                        return [val.func1, val.func2];
                    },

                    fromSerializable: function (val) {
                        return {
                            func1: val[0],
                            func2: val[1]
                        };
                    }
                },
                {
                    type: 'function',

                    shouldTransform: function (type) {
                        return type === 'function';
                    },

                    toSerializable: function (val) {
                        return val.toString().replace(/\s/g, '');
                    },

                    fromSerializable: function (val) {
                        return eval('(' + val + ')');
                    }
                },
                {
                    type: 'Error',

                    shouldTransform: function (type, val) {
                        return val instanceof Error;
                    },

                    toSerializable: function (val) {
                        return val.message;
                    },

                    fromSerializable: function (val) {
                        return new Error(val);
                    }
                }
            ]);

        var obj = {
            someClassProp: new SomeClass(),
            otherObjects:  [
                new Error('Hey ya!'),

                function () {
                    return '42';
                },

                {
                    strProperty:    'yo',
                    numberProperty: 42
                }
            ]
        };

        var actual = replicator.decode(replicator.encode(obj));

        assert.strictEqual(actual.someClassProp.func1(), 'yo1');
        assert.strictEqual(actual.someClassProp.func2(), 'yo2');
        assert(actual.otherObjects[0] instanceof Error);
        assert.strictEqual(actual.otherObjects[0].message, 'Hey ya!');
        assert.strictEqual(actual.otherObjects[1](), '42');

        assert.deepEqual(actual.otherObjects[2], {
            strProperty:    'yo',
            numberProperty: 42
        });

    });

    it('Should not modify original object', function () {
        var replicator = new Replicator();

        var obj = {
            someProp1: {
                prop: ['Hey ya']
            },
            someProp2: ['yo']
        };

        replicator.addTransform({
            type: 'single-item-array',

            shouldTransform: function (type, val) {
                return Array.isArray(val) && val.length === 1;
            },

            toSerializable: function (val) {
                return val[0];
            },

            fromSerializable: function (val) {
                return [val];
            }
        });

        var actual = replicator.decode(replicator.encode(obj));

        assert.deepEqual(actual, obj);

        assert.deepEqual(obj, {
            someProp1: {
                prop: ['Hey ya']
            },
            someProp2: ['yo']
        });
    });

    it('Should encode circular references', function () {
        var replicator = new Replicator();
        var obj        = {};

        var SomeClass = function () {
            this.arr = [];
        };

        obj.a = obj;

        obj.b = {
            ba: 123,
            bb: obj
        };

        obj.c = {
            ca: obj.b
        };

        obj.b.bc = obj.c;
        obj.d    = [obj, obj.c];
        obj.c.cb = obj.d;

        obj.e = new SomeClass();
        obj.e.arr.push(obj.e);

        replicator.addTransform({
            type: 'SomeClass',

            shouldTransform: function (type, val) {
                return val instanceof SomeClass;
            },

            toSerializable: function (val) {
                return val.arr;
            },

            fromSerializable: function (val) {
                var inst = new SomeClass();

                inst.arr = val;

                return inst;
            }
        });

        var actual = replicator.decode(replicator.encode(obj));

        assert.strictEqual(actual.a, actual);
        assert.strictEqual(actual.b.ba, 123);
        assert.strictEqual(actual.b.bb, actual);
        assert.strictEqual(actual.c.ca, actual.b);
        assert.strictEqual(actual.b.bc, actual.c);
        assert.strictEqual(actual.d[0], actual);
        assert.strictEqual(actual.d[1], actual.c);
        assert.strictEqual(actual.c.cb, actual.d);
        assert(actual.e instanceof SomeClass);
        assert.strictEqual(actual.e.arr[0], actual.e);
    });

    it('Should escape object keys when necessary', function () {
        var obj = {
            '@t':    1,
            '###@t': 2,
            '#@t':   3,
            '@r':    4,
            '##@r':  5
        };

        var replicator = new Replicator();
        var actual     = replicator.decode(replicator.encode(obj));

        assert.deepEqual(actual, obj);
    });
});

describe('Built-in transforms', function () {
    var replicator = new Replicator();

    it('Should transform NaN', function () {
        var actual = replicator.decode(replicator.encode(NaN));

        assert.strictEqual(typeof actual, 'number');
        assert(isNaN(actual));
    });

    it('Should transform undefined', function () {
        var actual = replicator.decode(replicator.encode({ obj: void 0 }));

        assert.strictEqual(actual.obj, void 0);
    });

    it('Should transform Date', function () {
        var actual = replicator.decode(replicator.encode(new Date(2016, 5, 6)));

        assert(actual instanceof Date);
        assert.strictEqual(actual.getFullYear(), 2016);
        assert.strictEqual(actual.getMonth(), 5);
    });

    it('Should transform RegExp', function () {
        var actual = replicator.decode(replicator.encode(/\d+/gim));

        assert(actual instanceof RegExp);
        assert.strictEqual(actual.source, '\\d+');
        assert.strictEqual(actual.global, true);
        assert.strictEqual(actual.ignoreCase, true);
        assert.strictEqual(actual.multiline, true);
    });

    it('Should transform Error', function () {
        var obj = {
            error:       new Error('err1'),
            syntaxError: new SyntaxError('err2')
        };

        obj.error.stack       = 'stack1';
        obj.syntaxError.stack = 'stack2';

        var actual = replicator.decode(replicator.encode(obj));

        assert(actual.error instanceof Error);
        assert(actual.syntaxError instanceof SyntaxError);
        assert.strictEqual(actual.error.toString(), 'Error: err1');
        assert.strictEqual(actual.syntaxError.toString(), 'SyntaxError: err2');
        assert.strictEqual(actual.error.stack, 'stack1');
        assert.strictEqual(actual.syntaxError.stack, 'stack2');
    });
});
