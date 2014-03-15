var backport;

document.addEventListener('DOMContentLoaded', function () {
    if (!localStorage['jid']) {
        document.getElementById('jid').textContent = "no jid";
        document.getElementById('no-jid').classList.remove('hidden');
        return;
    } else document.getElementById('no-jid').classList.add('hidden');
//     var $ownid = document.createElement('div');
//     $ownid.textContent = "my id: " + chrome.runtime.id;
//     document.body.appendChild($ownid);
    chrome.extension.sendRequest({type:'status',jid:localStorage['jid']},function(res){
        res = res || {connected:false};
        if (res.error) return document.body.textContent = res.error;
        updateStatus(res);
    });
    // connect directly to the packaged app
    backport = new BackPort('popup')
        .on('status', function (jid, res) {
            if (jid === localStorage['jid'])
                updateStatus(res);
        });
    document.getElementById('connect').addEventListener('click', function (ev) {
        ev.target.disabled = true;
    });
    document.getElementById('disconnect').addEventListener('click', function (ev) {
        ev.target.disabled = true;
    });
});

function updateStatus(res) {
    var connectButton = document.getElementById('connect');
    var disconnectButton = document.getElementById('disconnect');
    disconnectButton.disabled = connectButton.disabled = !!res.disabled;
    document.getElementById('jid').textContent = localStorage['jid'];
    if (res.connected) {
        document.getElementById('online').classList.remove('hidden');
        document.getElementById('offline').classList.add('hidden');
        disconnectButton.classList.remove('hidden');
        connectButton.classList.add('hidden');
    } else {
        document.getElementById('online').classList.add('hidden');
        document.getElementById('offline').classList.remove('hidden');
        disconnectButton.classList.add('hidden');
        connectButton.classList.remove('hidden');
    }
}
