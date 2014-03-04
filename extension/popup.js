
document.addEventListener('DOMContentLoaded', function () {

    var $ownid = document.createElement('div');
    $ownid.textContent = "my id: " + chrome.runtime.id;
    document.body.appendChild($ownid);


    var $ul = document.createElement('ul');
    document.body.appendChild($ul);


    chrome.runtime.getBackgroundPage(function (bg) {
        var appid = bg && bg.getAppID();
        if (appid) {
            document.body.textContent = localStorage['jid'];

//             chrome.runtime.sendMessage(appid, {action:'get', type:'status'}, function (response) {
//                 document.body.textContent = response;
//             });

        } else {
            document.body.textContent = "XMPP App missing!";
        };
    });
});
