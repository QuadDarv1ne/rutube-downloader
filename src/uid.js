const allKeys =
    "0123456789abcdefghigklmnopqrstuvwxyzABCDEFGHIGKLMNOPQRSTUVWXYZ";

const allKeysBuilder = key => () =>
    key.replace(/\*/g, () => allKeys[(Math.random() * 62) | 0]);

exports.uuid9 = allKeysBuilder("***-***-***");
