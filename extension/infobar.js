

document.addEventListener('DOMContentLoaded', function () {

    document.querySelector('button[name="allow"]').addEventListener('click', function () {
        chrome.extension.sendRequest({type:'allow'}, function () {
            window.close();
        });
    }, false);

    document.querySelector('button[name="deny"]').addEventListener('click', function () {
        chrome.extension.sendRequest({type:'deny'}, function () {
            window.close();
        });
    }, false);

});


