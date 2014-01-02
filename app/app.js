require('util').debuglog = function (tag) {
    return console.log.bind(console, tag+":");
};

var xmpp = require('node-xmpp');
if (window) window.xmpp = xmpp;

// var client = new xmpp.Client({jid:"jid@domain.lit", password:"secret"});
