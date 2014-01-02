

window.XMPP = function XMPP() {

};


XMPP.prototype.connect = function connect() {
    window.postMessage({type:'xmpp', action:'connect'}, '*');
};
