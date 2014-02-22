

window.XMPP = function XMPP() {
    this.id = [].map.call(crypto.getRandomValues(new Uint16Array(8)),function(x){return x.toString(16)}).join('');
    window.addEventListener('message', this.onmessage.bind(this));
    window.postMessage({type:'xmpp', action:'init', id:this.id}, '*');
};


XMPP.prototype.onmessage = function onmessage(ev) {
    if (ev.source !== window) return;
    if (ev.data.type !== 'xmpp') return;
    if (ev.data.id !== this.id) return;
    if (!ev.data.method) return;
    if (!this[ev.data.method]) return;

    return this[ev.data.method].apply(this, ev.data.args || []);
};


XMPP.prototype.connect = function connect() {
    window.postMessage({type:'xmpp', action:'connect', id:this.id}, '*');
};


XMPP.prototype.end = function end() {
    window.postMessage({type:'xmpp', action:'end', id:this.id}, '*');
};


// overwritables
XMPP.prototype.onerror = function onerror(err) {throw err};
XMPP.prototype.onstanza = function onevent(event) {console.log('stanza', stanza)};

XMPP.prototype.onevent = function onevent(event) {console.log(event)};
