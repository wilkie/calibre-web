/*
 * kthoom.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2011 Google Inc.
 * Copyright(c) 2011 antimatter15
*/

import { BookViewer, FitMode } from './kthoom/book-viewer.js';
import { BookEventType } from './kthoom/book-events.js';
import { BookBinder } from './kthoom/book-binder.js';
import { createPageFromFileAsync } from './kthoom/page.js';
import { KthoomApp } from './kthoom/kthoom.js';
import { config } from './kthoom/config.js';
import { Params } from './kthoom/helpers.js';

/* Default settings */

var settings = {
    hflip: false,
    vflip: false,
    rotateTimes: 0,
    fitMode: FitMode.Best,
    theme: "light",
    direction: 0 // 0 = Left to Right, 1 = Right to Left
};

/* Page Events */
document.querySelector("#left").addEventListener("click", (event) => {
    if (settings.direction === 0) {
        theApp.showPrevPage();
    } else {
        theApp.showNextPage();
    }
});

document.querySelector("#right").addEventListener("click", (event) => {
    if (settings.direction === 0) {
        theApp.showNextPage();
    } else {
        theApp.showPrevPage();
    }
});

/* Title bar button events */
function testSupportsSmoothScroll () {
    var supports = false
    try {
        var div = document.createElement('div')
        div.scrollTo({
            top: 0,
            get behavior () {
                supports = true
                return 'smooth'
            }
        })
    } catch (err) {}
    return supports
}

// Detect native smooth scrolling and use that when it can;
// Otherwise, fall back.
let scrollOptionsSupported = testSupportsSmoothScroll();
function scrollTocToActive() {
    let top = document.querySelector("#tocView a.active").offsetTop;
    if (scrollOptionsSupported) {
        // Scroll to the thumbnail in the TOC on page change
        document.querySelector("#tocView").scrollTo({
            top: top,
            behavior: "smooth"
        });
    }
    else {
        document.querySelector("#tocView").scrollTop = top;
    }
}

// Open/close the toc slider
document.querySelector("#slider").addEventListener("click", (event) => {
    document.querySelector("#sidebar").classList.toggle("open");
    document.querySelector("#main").classList.toggle("closed");
    document.querySelector("#slider").classList.toggle("icon-menu");
    document.querySelector("#slider").classList.toggle("icon-right");

    // We need this in a timeout because if we call it during the CSS transition, IE11 shakes the page ¯\_(ツ)_/¯
    setTimeout(function() {
        // Focus on the TOC or the main content area, depending on which is open
        let panel = document.querySelector("#main:not(.closed) #mainContent, #sidebar.open #tocView");
        if (panel) {
            panel.focus();
        }
        scrollTocToActive();
    }, 500);
});

// Open Settings modal
document.querySelector("#setting").addEventListener("click", (event) => {
    document.querySelector("#settings-modal").classList.toggle("md-show");
});

// Settings updating
document.querySelectorAll("#settings input").forEach( (input) => {
    input.addEventListener("change", (event) => {
        // Get either the checked boolean or the assigned value
        let target = this || event.target;
        var value = target.getAttribute("type") === "checkbox" ? target.checked : target.value;

        // If it's purely numeric, parse it to an integer
        value = /^\d+$/.test(value) ? parseInt(value) : value;

        settings[target.getAttribute("name")] = value;
        saveSettings();
        loadSettings();
        theApp.loadSettings_();
    });
});

// Settings save
function saveSettings() {
    localStorage.kthoom_settings = JSON.stringify(settings);
}

function loadSettings() {
    try {
        if (!localStorage.kthoom_settings) {
            return;
        }

        settings = Object.assign(settings, JSON.parse(localStorage.kthoom_settings));

        setSettings();
    } catch (err) {
        console.error("Error loading settings.");
    }
}

function setSettings() {
    // Set settings control values
    Object.keys(settings).forEach( (key) => {
        let value = settings[key];
        let target = document.querySelector("input[name=" + key + "]");
        if (target) {
            if (typeof value === "boolean") {
                target.checked = value;
            } else {
                let target = document.querySelector("input[name=" + key + "][value=\"" + value + "\"]");
                target.checked = true;
            }
        }
    });

    if (settings.theme === "dark") {
        document.body.classList.add("dark-theme");
    }
    else if (document.body.classList.contains("dark-theme")) {
        document.body.classList.remove("dark-theme");
    }
};

// Load settings
loadSettings();

// Close modal
document.querySelectorAll(".closer, .overlay").forEach( (e) => {
    e.addEventListener("click", (event) => {
        document.querySelector(".md-show").classList.remove("md-show");
    });
});

// Fullscreen mode
if (typeof window.screenfull !== "undefined") {
    document.querySelector("#fullscreen").addEventListener("click", (event) => {
        window.screenfull.toggle(document.querySelector("#container"));
    });

    if (window.screenfull.raw) {
        var $button = document.querySelector("#fullscreen");
        document.addEventListener(window.screenfull.raw.fullscreenchange, (event) => {
            if (window.screenfull.isFullscreen) {
                $button.classList.add("icon-resize-small");
                $button.classList.remove("icon-resize-full")
            }
            else {
                $button.classList.add("icon-resize-full");
                $button.classList.remove("icon-resize-small");
            }
        });
    }
}

/* KThoom Configuration */

Params['bookUri'] = window.cbrURL;

config
  .set('PATH_TO_BITJS', '/static/js/kthoom/bitjs/')
  .lock();

const theApp = new KthoomApp();
if (!window.kthoom.getApp) {
  window.kthoom.getApp = () => theApp;
}

// Hook into page viewer
// gotoPage keeps track of an internal method to goto a particular page
let gotoPage = null;
// updateLayout is a function that is called whenever the page is redrawn
const updateLayout = BookViewer.prototype.updateLayout;

// Capture calls to updateLayout()
BookViewer.prototype.updateLayout = function() {
    let index = this.currentPageNum_ + 1;

    // Update toc
    document.querySelectorAll("#tocView a[data-page]").forEach( (e) => {
        e.classList.remove("active");
    });

    let page = document.querySelector("#tocView a[data-page=\"" + index + "\"]");
    if (page) {
        page.classList.add("active");
        scrollTocToActive();
    }

    gotoPage = this.showPage.bind(this);

    // Call the normal showPage
    updateLayout.bind(this)();
}

var imageFiles = [];
var imageFilenames = [];

// Hook into the book binder to retrieve thumbnails //
const bookBinderStart = BookBinder.prototype.start;
BookBinder.prototype.start = function() {
    this.subscribeToAllEvents(bookBinderStart, (evt) => {
        if (evt.type == BookEventType.PAGE_EXTRACTED) {
            let page = evt.page;

            if (imageFilenames.indexOf(page.getPageName()) === -1) {
                if (page.getMimeType() !== undefined) {
                    imageFilenames.push(page.getPageName());
                    imageFiles.push(page);
                    // add thumbnails to the TOC list
                    let thumbnails = document.querySelector("#thumbnails");
                    if (thumbnails) {
                        let thumb = document.createElement("li");
                        let link = document.createElement("a");
                        link.setAttribute("data-page", imageFiles.length);
                        let img = document.createElement("img");
                        img.src = imageFiles[imageFiles.length - 1].getURI();
                        link.appendChild(img);
                        let span = document.createElement("span");
                        span.textContent = imageFiles.length;
                        link.appendChild(span);
                        thumb.appendChild(link);
                        thumbnails.appendChild(thumb);

                        link.addEventListener("click", (_) => {
                            let index = parseInt(link.getAttribute("data-page"));
                            gotoPage(index - 1);
                        });
                    }
                }
            }
        }
    });

    // Call the normal start
    bookBinderStart.bind(this)();
};

// Load the book
theApp.loadSingleBookFromXHR(window.cbrURL, window.cbrURL, -1);
