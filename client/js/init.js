/*
    Prologue by HTML5 UP
    html5up.net | @n33co
    Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

(function($) {
//     setTimeout(function () {

//     skel.newStyleSheet('css/style.css');
    skel.init({
        reset: 'full',
        prefix: 'css/style',
        breakpoints: {
            'global':   { range: '*', containers: 1400, grid: { gutters: 40 } },
            'wide':     { range: '961-1880', containers: 1200, grid: { gutters: 40 } },
            'normal':   { range: '961-1620', containers: 960, grid: { gutters: 40 } },
            'narrow':   { range: '961-1320', containers: '100%', grid: { gutters: 20 } },
            'narrower': { range: '-960', containers: '100%', grid: { gutters: 15 } },
            'mobile':   { range: '-640', lockViewport: true, grid: { collapse: true } }
        }
    }, {
        layers: {
            layers: {
                sidePanel: {
                    hidden: true,
                    breakpoints: 'narrower',
                    position: 'top-left',
                    side: 'left',
                    animation: 'pushX',
                    width: 320,
                    height: '100%',
                    clickToClose: true,
                    html: '<div data-action="moveElement" data-args="header"></div>',
                    orientation: 'vertical'
                },
                sidePanelToggle: {
                    breakpoints: 'narrower',
                    position: 'top-left',
                    side: 'top',
                    height: '4em',
                    width: '5em',
                    html: '<div data-action="toggleLayer" data-args="sidePanel" class="toggle"></div>'
                }
            }
        }
    });

    $(function() {

        var	$window = $(window),
            $body = $('body');

        // Disable animations/transitions until the page has loaded.
            $body.addClass('is-loading');

            $window.on('load', function() {
                $body.removeClass('is-loading');
            });

        var $nav_a; window.scrollzerize = function () {

        // Scrolly links.
            $('.scrolly').scrolly();

        // Nav.
            $nav_a = $('#nav a, #status-link');
            var $new_nav_a = $nav_a.filter(':not(.scrollzer-initialized)')

            // Initialize active nav element by location.hash
            if (location.hash[0] == '#')
                $nav_a.filter('[id="' + location.hash.substring(1) + '-link"]').addClass('active');

            // Scrolly-fy links.
                $new_nav_a
                    .scrolly()
                    .on('click', function(e) {

                        var t = $(this),
                            href = t.attr('href');

                        if (href[0] != '#')
                            return;

                        e.preventDefault();

                        // Clear active and lock scrollzer until scrolling has stopped
                            $nav_a
                                .removeClass('active')
                                .addClass('scrollzer-locked');

                        // Set this link to active
                            t.addClass('active');

                    });

            // Initialize scrollzer.
                var ids = [];

                $new_nav_a.each(function() {
                    var $a = $(this);

                    var href = $a.attr('href');

                    if (href[0] != '#')
                        return;

                    ids.push(href.substring(1));
                    $a.addClass('scrollzer-initialized');

                });

                $.scrollzer(ids, { pad: 200, lastHack: true });
        };

        $('body').addClass('toggle-root'); // at least this one
        window.toggle_data_class = function () {
            var $this = $(this),
                params = $this.data('toggle').split('→');
            $this.parents('.toggle-root').first()
                 .find(params[0].trim() + ':not(.button)')
                 .toggleClass(params[1].trim());
        };
        window.retogglize = function () {
            $('.button[data-toggle]:not(.data-toggle)')
                .addClass('data-toggle')
                .on('click', toggle_data_class);
        };

        window.scrollzerize();
        window.retogglize();
    });

//     }, 0)

})(jQuery);