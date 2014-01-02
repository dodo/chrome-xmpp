var actions = {};

chrome.app.runtime.onLaunched.addListener(function() {

    chrome.notifications.create("onLaunched", {
        title: "XMPP Background Gears",
        message: "Launched! " + chrome.runtime.id,
        type: "basic",
        iconUrl: "icon.png",
    }, function (id) {
        console.log(id, "created");
    });

});

chrome.runtime.onConnectExternal.addListener(function (port) {
    port.onMessage.addListener(function (message) {
        if (!message.action) return;
        if (!actions[message.action]) return;

        return actions[message.action].call(port, message);
        // return true; // send a response asynchronously
    });
});



actions.login = function (data) {
    console.log("try to login into", data.jid);
};
