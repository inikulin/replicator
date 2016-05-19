var Replicator = require('../');
var assert     = require('assert');

it('Should add and remove transforms', function () {
    var replicator = new Replicator();
    var transform1 = { type: 'transform1' };
    var transform2 = { type: 'transform2' };

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
    it('Should encode objects using transforms', function () {
        var replicator = new Replicator();

        var SomeClass = function () {

        };

        SomeClass.prototype.func1 = function () {
            return 'yo1';
        };

        SomeClass.prototype.func2 = function () {
            return 'yo2';
        };

        replicator
            .addTransform({
                type: 'SomeClass',

                shouldTransform: function (type, val) {
                    return val instanceof SomeClass;
                },

                toSerializable: function (val) {
                    return [val.func1, val.func2];
                }
            })
            .addTransform({
                type: 'function',

                shouldTransform: function (type) {
                    return type === 'function';
                },

                toSerializable: function (val) {
                    return val.toString().replace(/\s/g, '');
                }
            })
            .addTransform({
                type: 'Error',

                shouldTransform: function (type, val) {
                    return val instanceof Error;
                },

                toSerializable: function (val) {
                    return val.message;
                }
            });

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

        var encoded = replicator.encode(obj);

        assert.deepEqual(JSON.parse(encoded), [{
            someClassProp: {
                '@t': 'SomeClass',

                data: [
                    {
                        '@t': 'function',
                        data: "function(){return'yo1';}"
                    },
                    {
                        '@t': 'function',
                        data: "function(){return'yo2';}"
                    }
                ]
            },

            otherObjects: [
                {
                    '@t': 'Error',
                    data: 'Hey ya!'
                },
                {
                    '@t': 'function',
                    data: "function(){return'42';}"
                },
                {
                    strProperty:    'yo',
                    numberProperty: 42
                }
            ]
        }]);
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
            type: 'array',

            shouldTransform: function (type, val) {
                return Array.isArray(val);
            },

            toSerializable: function (val) {
                return val[0];
            }
        });

        var encoded = replicator.encode(obj);

        assert.deepEqual(JSON.parse(encoded), [{
            someProp1: {
                prop: {
                    '@t': 'array',
                    data: 'Hey ya'
                }
            },
            someProp2: {
                '@t': 'array',
                data: 'yo'
            }
        }]);

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
