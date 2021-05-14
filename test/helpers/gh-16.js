var data = 'foo';

module.exports.getData = function () {
    return data;
};

module.exports.setData = function (newData) {
    data = newData;

    return data;
};