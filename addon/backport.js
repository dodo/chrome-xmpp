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

proto.off = function (event, listener) {
    if (!listener) {
        delete this._events[event];
    } else if (this._events[event]) {
        this._events[event] = this._events[event].filter(function (callback) {
            return callback !== listener;
        });
    }
    return this;
}

proto.emit = function (event/*, [args, …]*/) {
    if (this._events[event]) {
        var args = __slice.call(arguments, 1);
        this._events[event].forEach(function (listener) {
            listener.apply(this, args);
        }.bind(this));
    }
    return this;
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
    return this;
};

proto.connect = function () {
    this.port = chrome.runtime.connect({name:this.id});
    this.port.onMessage.addListener(function (msg) {
        if (msg && msg.event && msg.args)
            this.emit.apply(this, msg.args);
    }.bind(this));
    return this;
};

proto.dispatch = function (el) {
    el.dispatchEvent(new CustomEvent('BackPortLoaded', {
        cancelable: true,
        bubbles: true,
        detail: this,
    }));
    return this;
};
