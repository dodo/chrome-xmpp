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
            ev.target.disabled = true;
            attachOptions(ev.target.getAttribute('data-account'), function (opts) {
                backport.send('connect', opts);
            });
        });
        el.querySelector('button.disconnect').addEventListener('click', function (ev) {
            ev.target.disabled = true;
            backport.send('disconnect', {id:ev.target.getAttribute('data-account')});
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
