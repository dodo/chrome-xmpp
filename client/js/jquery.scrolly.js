/* jquery.scrollzer v0.2 | (c) n33 | n33.co @n33co | MIT + GPLv2 */
jQuery.fn.scrolly = function() {
    var bh = jQuery('body,html'), t = jQuery(this);

    t.click(function(e) {
        var h = jQuery(this).attr('href'), target;

        if (h.charAt(0) == '#' && h.length > 1 && (target = jQuery(''+h)).length > 0)
        {
            var pos = Math.max(target.offset().top, 0);
            e.preventDefault();
            bh
                .stop(true, true)
                .animate({ scrollTop: pos }, 'slow', 'swing');
        }
    });

    return t;
};