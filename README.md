<p align="center">
    <a href="https://github.com/inikulin/replicator">
        <img src="https://raw.github.com/inikulin/replicator/master/media/logo.png" alt="replicator" />
    </a>
</p>
<p align="center">
<i>Advanced JavaScript objects serialization</i>
</p>
- Can serialize circular references
- In addition to JSON-serializable types can serialize:
  - `undefined`
  - `NaN`
  - `Date`
  - `RegExp`
  - `Error`<sup>[1](#note1)</sup>
  - `Map`<sup>[2](#note2)</sup>
  - `Set`<sup>[3](#note3)</sup>
  - `ArrayBuffer`<sup>[3](#note4)</sup>
  - Typed arrays<sup>[3](#note5)</sup>
- Can be extended with custom type transforms
- Can use any target serializer under the hood (JSON, BSON, protobuf, etc.)

----
<a name="note1">1</a>: If decoding target platform doesn't support encoded error type, it will fallback to `Error` constructor.<br>
<a name="note2">2</a>: If decoding target platform doesn't support `Map`, it will be decoded as array of `[key, value]`.<br>
<a name="note3">3</a>: If decoding target platform doesn't support `Set`, `ArrayBuffer` or typed arrays, they will be decoded as array. <br>

## Install
```shell
npm install replicator
```

## Usage
```js
const Replicator = require('replicator');

const replicator = new Replicator();

const str = replicator.encode({
    key1: new Set([1, 2, 3]),
    key2: /\s+/ig
});

const obj = replicator.decode(str);
```


## Adding custom types support

## Changing serialization format

## Author
[Ivan Nikulin](https://github.com/inikulin) (ifaaan@gmail.com)
