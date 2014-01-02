var bgapp, bgappid;
chrome.management.getAll(function (apps) {
    if(apps.some(function (app) {
        if(app.type !== 'packaged_app') return;
        if(app.name !== "XMPP") return;
        bgappid = app.id;
        return true;
    })) {

        if (localStorage['jid'] && localStorage['pw']) {
            // autostart
            chrome.management.launchApp(bgappid, function () {

                bgapp = chrome.runtime.connect(bgappid);

                bgapp.postMessage({
                    action: 'login',
                    jid:localStorage['jid'],
                    pw: localStorage['pw'],
                });
            });
        }

    };
});

chrome.extension.onRequest.addListener(function (request, sender, sendResponse) {

    if (request.type === 'permission') {
        chrome.infobars.show({
            path: "infobar.html",
            tabId: sender.tab.id,
        });
    }

    sendResponse({});
});

function getAppID() {
    return bgappid;
}
