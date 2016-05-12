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

describe('Encoding basics', function () {
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

                shouldTransformToPrimitive: function (type, val) {
                    return val instanceof SomeClass;
                },

                toPrimitive: function (val) {
                    return [val.func1, val.func2];
                }
            })
            .addTransform({
                type: 'function',

                shouldTransformToPrimitive: function (type) {
                    return type === 'function';
                },

                toPrimitive: function (val) {
                    return val.toString().replace(/\s/g, '');
                }
            })
            .addTransform({
                type: 'Error',

                shouldTransformToPrimitive: function (type, val) {
                    return val instanceof Error;
                },

                toPrimitive: function (val) {
                    return val.message;
                }
            });

        var encoded = replicator.encode({
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
        });

        assert.deepEqual(JSON.parse(encoded), {
            someClassProp: {
                '@@type': 'SomeClass',

                data: [
                    {
                        '@@type': 'function',
                        data:     "function(){return'yo1';}"
                    },
                    {
                        '@@type': 'function',
                        data:     "function(){return'yo2';}"
                    }
                ]
            },

            otherObjects: [
                {
                    '@@type': 'Error',
                    data:     'Hey ya!'
                },
                {
                    '@@type': 'function',
                    data:     "function(){return'42';}"
                },
                {
                    strProperty:    'yo',
                    numberProperty: 42
                }
            ]
        });
    });

    it('Should escape object keys when necessary', function () {
        var replicator = new Replicator();
        var encoded    = replicator.encode({
            '@@type':    1,
            '###@@type': 2,
            '#@@type':   3
        });

        assert.deepEqual(JSON.parse(encoded), {
            '#@@type':    1,
            '####@@type': 2,
            '##@@type':   3
        });
    });
});
