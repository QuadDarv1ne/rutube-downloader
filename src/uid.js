/**
 * Возвращает дату и время вызова функции
 * В нашем случае время начала работы с данными в момент запроса title для файла
 */
const allKeysBuilder = () => new Date().toISOString().replace(/[:.]/g, `-`).replace(/T/, `_`).replace(/Z$/, ``);

exports.uuid9 = allKeysBuilder;
