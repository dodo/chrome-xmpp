var __slice = [].slice;
var util = require('util');
var Connection = require('../../lib/connection');
var NS = Connection.NS;

window.XMPP = XMPP;
util.inherits(XMPP, Connection);
function XMPP(opts) {
    Connection.call(this, {
        target:window,
        origin:opts && opts.origin,
    }).listen(window);
    // trigger contentscript to open a port
    window.postMessage({
        type:'xmpp',
        action:'init',
        id:this.id,
    }, this.origin);
    this.on('connect', function (jid) { this.jid = jid });
    // DEBUG
    this.on('stanza', function (stanza) {console.log('stanza', stanza)});
};
var proto = XMPP.prototype;

proto.on = function (event, listener) {
    // TODO FIXME allow sending events 'ping.pong', 'presence.stanza', 'presence.send'
    if (['allow'].indexOf(event) === -1 && this.listeners(event).length === 0)
        this.send('listen', event);
    return Connection.prototype.on.call(this, event, listener);
};

proto.call = function (method/*, [args…]*/) {
    var args = __slice.call(arguments);
    args.unshift('call');
    return this.send.apply(this, args);
};

proto.connect    = function () {
    return this.send('request permission');
};

proto.disconnect = function () {
    return this.send('disconnect');
};

proto.remove     = function () {
    return this.send('remove permission');
};

//------------------------------------------------------------------------------

window.testXMPP = function () {
    var match = require('JSONSelect').match; // FIXME
    var client = new window.XMPP().connect();


    client.on('error', function (err) {
        console.error(err);
    });

    client.on('ping.send', function (stanza) {
        console.log("sent a ping", stanza);
    });

    client.on('ping.receive', function (stanza) {
        console.log("received a ping", stanza);
    });

    client.on('disco.info', function (stanza) {
        console.log("received a info disco query", stanza);
    });

    client.on('presence.send', function (stanza) {
        console.log("sent a presence", stanza);
    });

    client.on('presence.receive', function (stanza) {
        console.log("received a presence", stanza);
    });

    client.on('message.send', function (stanza) {
        console.log("sent a message", stanza);
    });

    client.on('message.receive', function (stanza) {
        console.log("received a message", stanza);

        if (stanza.attrs.type === 'error') return; // never reply to errors
        // lift text body
        var body = match('.name:val("body") ~ .children string', stanza);
        if (body && body.length)
            stanza.attrs.body = body.join("");
        // Swap addresses...
        stanza.attrs.to = stanza.attrs.from;
        delete stanza.attrs.from;
        // and send back.
        setTimeout(function () {
            client.call('message.send', stanza.attrs);
        }, 1000);
    });

    client.on('version.info', function (stanza) {
        console.log("received a version info", stanza);
    });


    client.on('online', function () {
        console.log("online");
        client.call('presence.send', {
            show:"chat",
            status:"Happily echoing your <message/> stanzas",
            from:client.jid,
        });
    });

    return client;
}