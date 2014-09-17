/* jquery.scrollzer v0.2 | (c) n33 | n33.co @n33co | MIT + GPLv2 */
jQuery.scrollzer = function(ids, userSettings) {

    var top = jQuery(window), doc = jQuery(document);

    top.load(function() {

        // Settings
            var settings = jQuery.extend({
                activeClassName:    'current_page_item',
                suffix:             '-link',
                pad:                50,
                firstHack:          false,
                lastHack:           false
            }, userSettings);

        // Variables
            var k, x, o, l, pos;
            var lastId, elements = [], links = jQuery();

        // Build elements array
            for (k in ids)
            {
                o = jQuery('[id="' + ids[k] + '"]');
                l = jQuery('[id="' + ids[k] + settings.suffix + '"]');

                if (o.length < 1
                ||  l.length < 1)
                    continue;

                x = {};
                x.link = l;
                x.object = o;
                elements[ids[k]] = x;
                links = links.add(l);
            }

        // Resize event (calculates start/end values for each element)
            var resizeTimerId, resizeFunc = function() {
                var x;

                for (k in elements)
                {
                    x = elements[k];
                    x.start = Math.ceil(x.object.offset().top) - settings.pad;
                    x.end = x.start + Math.ceil(x.object.innerHeight());
                }

                top.trigger('scroll');
            };

            top.resize(function() {
                window.clearTimeout(resizeTimerId);
                resizeTimerId = window.setTimeout(resizeFunc, 250);
            });

        // Scroll event (checks to see which element is on the screen and activates its link element)
            var scrollTimerId, scrollFunc = function() {
                links.removeClass('scrollzer-locked');
            };

            top.scroll(function(e) {
                var i = 0, h, found = false;
                pos = top.scrollTop();

                window.clearTimeout(scrollTimerId);
                scrollTimerId = window.setTimeout(scrollFunc, 250);

                // Step through elements
                    for (k in elements)
                    {
                        if (k != lastId
                        &&  pos >= elements[k].start
                        &&  pos <= elements[k].end)
                        {
                            lastId = k;
                            found = true;
                        }

                        i++;
                    }

                // If we're using lastHack ...
                    if (settings.lastHack
                    &&  pos + top.height() >= doc.height())
                    {
                        lastId = k;
                        found = true;
                    }

                // If we found one ...
                    if (found
                    &&  !links.hasClass('scrollzer-locked'))
                    {
                        links.removeClass(settings.activeClassName);
                        if (elements[lastId])
                        elements[lastId].link.addClass(settings.activeClassName);
                    }
            });

        // Initial trigger
            top.trigger('resize');

    });

};