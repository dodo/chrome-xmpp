var Lightstream = require('lightstream');
var XEP = require('lightstream/xep');
function xep(name) {return XEP[name]}

Client.EVENTS = ['connect', 'reconnect', 'disconnect', 'online', 'offline', 'error', 'end', 'stanza'];

module.exports.pool = {};

module.exports.Client = Client;
function Client(opts) {
    this.jid = opts.jid;
    this.ids = {};
    this.attach(opts);
    this.fd = new Lightstream({
        backend:require('lightstream/backend/node-xmpp'),
    }).use(opts.cfg.plugins.filter(xep).map(xep));
//     this.fd.connect(otps.jid, opts.password, opts.params);
}

Client.prototype.attach = function attach(opts) {
    this.ids[opts.id] = opts.port;
};

Client.prototype.detach = function detach(opts) {
    delete this.ids[opts.id];
};

Client.prototype.setupEvents = function setupEvents() {
    Client.EVENTS.forEach(function (event) {
        this.fd.on(event, function () {
            var args = [event].concat(Array.prototype.slice.call(arguments));
            // TODO filter ids for permissions
            this.postMessage({
                action:'onevent',
                args:args,
            });
        });
    }.bind(this));
};

Client.prototype.postMessage = function postMessage(opts, ids) {
    ids = ids || this.ids;
    Object.keys(ids).forEach(function (id) {
        var data = {type:'xmpp'};
        Object.keys(opts).forEach(function (key) {data[key] = opts[key]});
        data.id = id;
        ids[id].postMessage(data, '*');
    }.bind(this));
};


