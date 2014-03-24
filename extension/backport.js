var __slice = Array.prototype.slice;

function BackPort(id) {
    this._events = [];
    this.id = id;
    this.connect();
}
var proto = BackPort.prototype;

proto.on = function (event, listener)  {
    this._events[event] = this._events[event] || [];
    this._events[event].push(listener);
    return this;
};

proto.emit = function (event/*, [args, …]*/) {
    if (this._events[event]) {
        var args = __slice.call(arguments, 1);
        this._events[event].forEach(function (listener) {
            listener.apply(this, args);
        }.bind(this));
    }
};

proto.send = function (event/*, [args, …]*/) {
    if (this.port) {
        var args = __slice.call(arguments);
        this.port.postMessage({
            id:this.id,
            event:event,
            args:args,
            ns:'chrome-xmpp',
        });
    }
};

proto.connect = function () {
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
