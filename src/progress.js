const cliProgress = require("cli-progress");
const _colors = require("ansi-colors");

exports.getProgress = () =>
    new cliProgress.SingleBar(
        {
            stopOnComplete: true,
            hideCursor: false,
            autopadding: true,
            fps: 5,
            barsize: 37,
        },
        {
            format: formatBar,
            barCompleteChar: "\u2588",
            barIncompleteChar: "\u2592",
        }
    );

function formatBar(optionsBar, paramsBar, payloadBar) {
    function autopadding(value, length) {
        return (optionsBar.autopaddingChar + value).slice(-length);
    }
    const completeSize = Math.round(paramsBar.progress * optionsBar.barsize);
    const incompleteSize = optionsBar.barsize - completeSize;
    const bar =
        optionsBar.barCompleteString.substr(0, completeSize) +
        optionsBar.barGlue +
        optionsBar.barIncompleteString.substr(0, incompleteSize);
    const percentage = Math.floor(paramsBar.progress * 100) + "";
    const stopTime = parseInt(Date.now());
    const elapsedTime = formatTime(Math.round(stopTime - paramsBar.startTime));
    var barStr =
        _colors.white("|") +
        _colors.cyan(bar + " " + autopadding(percentage, 3) + "%") +
        " " +
        _colors.white("|") +
        " " +
        elapsedTime +
        " " +
        _colors.white("|") +
        " " +
        autopadding(paramsBar.value, `${paramsBar.total}`.length) +
        `/${paramsBar.total}` +
        " " +
        _colors.white("|") +
        " active files: " +
        `${payloadBar.filename}`;
    return barStr;
}

function formatTime(value) {
    function autopadding(v) {
        return ("0" + v).slice(-2);
    }
    let s = autopadding(Math.floor((value / 1000) % 60));
    let m = autopadding(Math.floor((value / 1000 / 60) % 60));
    let h = autopadding(Math.floor((value / (1000 * 60 * 60)) % 24));
    return h + ":" + m + ":" + s;
}
