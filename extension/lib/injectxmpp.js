var util = require('util');
var Connection = require('./connection').Connection;
var NS = Connection.NS;


window.XMPP = function XMPP(opts) {
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
};
util.inherits(window.XMPP, Connection);


XMPP.prototype.connect = function connect() {this.send('request permission', this.id)};
XMPP.prototype.end     = function     end() {this.send('end', this.id)};


