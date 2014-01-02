var actions = {};

var script = document.createElement('script');
script.setAttribute('type', "text/javascript");
script.setAttribute('src', chrome.extension.getURL("injectxmpp.js"));
document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(script);
});

window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    if (ev.data.type !== 'xmpp') return;
    if (!ev.data.action) return;
    if (!actions[ev.data.action]) return;

    actions[ev.data.action].apply(ev, ev.data.args || []);
});

//------------------------------------------------------------------------------

actions.connect = function () {
    chrome.extension.sendRequest({type:'permission'}, function(res) {
        if (res.error) console.error(res.error);
    });
};

