/**
 * Возвращает дату и время вызова функции
 * В нашем случае время начала работы с данными в момент запроса title для файла
 */
const allKeysBuilder = () => {
	const ts = new Date().toISOString().replace(/[:.]/g, `-`).replace(/T/, `_`).replace(/Z$/, ``);
	const rand = Math.random().toString(36).substring(2, 8);
	return `${ts}-${rand}`;
};

exports.uuid9 = allKeysBuilder;
