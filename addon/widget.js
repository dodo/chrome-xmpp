var __slice = Array.prototype.slice;
var observers = [];

document.addEventListener('DOMContentLoaded', function () {
    bind(document.querySelector('main'));

    observe(document.querySelector('main'), function (node) {
        return node.nodeType === 1;
    }, bind);
    return;

    function bind(el) {
        __slice.call(el.querySelectorAll('button[href]')).forEach(function (el) {
            el.addEventListener('click', function (ev) {
                self.location.href = ev.target.getAttribute('href');
            });
        });
    }
});

document.addEventListener('BackPortLoaded', function (ev) {
    var backport = ev.detail;
    __slice.call(document.querySelectorAll('address')).forEach(bind);
    observe(document.querySelector('main'), function (node) {
        return node.nodeName.toLowerCase() === 'address';
    }, bind);
    return;

    function bind(el) {
        el.querySelector('button.connect').addEventListener('click', function (ev) {
            var id = ev.target.getAttribute('data-account');
            ev.target.disabled = true;
            chrome.extension.sendRequest({type:'connect', id:id}, function (res) {
                if (res && res.error) console.error(res.error);
            });
        });
        el.querySelector('button.disconnect').addEventListener('click', function (ev) {
            var id = ev.target.getAttribute('data-account');
            ev.target.disabled = true;
            chrome.extension.sendRequest({type:'disconnect', id:id}, function (res) {
                if (res && res.error) console.error(res.error);
            });
        });
    }
});

function observe(el, select, iter) {
    var observer = new MutationObserver(function (mutations) {
        mutations.reduce(function (nodes, mutation) {
            return nodes.concat(__slice.call(mutation.addedNodes));
        }, []).filter(select).forEach(iter);
    })
    observer.observe(el, {childList:true});
    observers.push(observer);
    return observer;
}
