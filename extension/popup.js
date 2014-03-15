var backport;

document.addEventListener('DOMContentLoaded', function () {
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
});

function updateStatus(res) {
    document.getElementById('jid').textContent = localStorage['jid'];
    if (res.connected) {
        document.getElementById('online').classList.remove('hidden');
        document.getElementById('offline').classList.add('hidden');
    } else {
        document.getElementById('online').classList.add('hidden');
        document.getElementById('offline').classList.remove('hidden');
    }
}
