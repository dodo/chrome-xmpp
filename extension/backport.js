var __slice = Array.prototype.slice;

function BackPort(id) {
    this._events = [];
    this.id = id;
    this.connect();
}

BackPort.prototype.on = function (event, listener)  {
    this._events[event] = this._events[event] || [];
    this._events[event].push(listener);
    return this;
}

BackPort.prototype.emit = function (event/*, [args, …]*/) {
    if (this._events[event]) {
        var args = __slice.call(arguments, 1);
        this._events[event].forEach(function (listener) {
            listener.apply(this, args);
        }.bind(this));
    }
}

BackPort.prototype.connect = function () {
    var that = this;
    chrome.runtime.getBackgroundPage(function (bg) {
        var appid = bg && bg.getAppID();
        if (appid) {
            console.log("connect to background …");
            that.port = chrome.runtime.connect(appid, {name:that.id});
            that.port.onMessage.addListener(function (msg) {
                if (msg && msg.event && msg.args)
                    that.emit.apply(that, msg.args);
            });
        } else {
            console.log("no appid", bg);
        };
    });
};
