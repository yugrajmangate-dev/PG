(function () {
  if (window.__sentinelPageGuardInstalled) {
    return;
  }
  window.__sentinelPageGuardInstalled = true;

  function isScannableFile(value) {
    if (!value) {
      return false;
    }

    var name = (value.name || "").toLowerCase();
    var type = (value.type || "").toLowerCase();
    var isImageType = type.indexOf("image/") === 0;
    var isPdfType = type.indexOf("application/pdf") === 0;
    var isDocType = type.indexOf("application/vnd.openxmlformats") === 0 || type.indexOf("text/") === 0;
    var isScannableName = /\.(png|jpe?g|bmp|gif|webp|tiff?|pdf|docx|pptx|txt|csv)$/.test(name);
    return isImageType || isPdfType || isDocType || isScannableName;
  }

  function isSensitiveFilename(filename) {
    var patterns = [
      /aadhaar/i,
      /aadhar/i,
      /voter/i,
      /epic/i,
      /election/i,
      /passport/i,
      /credential/i,
      /credentials/i,
      /secret/i,
      /key/i,
      /ssn/i,
      /pan/i,
      /driving.?licen[cs]e/i,
      /green.?card/i,
      /credit.?card/i,
      /debit.?card/i,
      /identity/i,
      /document/i
    ];

    return patterns.some(function (p) {
      return p.test(filename);
    });
  }

  function getImageFilesFromBody(body) {
    var imageFiles = [];

    if (!body) {
      return imageFiles;
    }

    try {
      // FormData: look for File/Blob entries or data-URI strings
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        for (var pair of body.entries()) {
          var value = pair[1];
          if (isScannableFile(value)) {
            imageFiles.push({ name: value.name || "file", type: value.type || "application/octet-stream", size: value.size || 0 });
          } else if (typeof value === 'string' && (value.indexOf('data:image/') !== -1 || /base64,/.test(value))) {
            imageFiles.push({ name: 'formdata-string', type: 'text', size: value.length });
          } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
            if ((value.type || '').indexOf('image/') === 0) {
              imageFiles.push({ name: value.name || 'blob', type: value.type || 'image', size: value.size || 0 });
            }
          }
        }
      }
      // Single File
      else if (typeof File !== 'undefined' && body instanceof File) {
        if (isScannableFile(body)) imageFiles.push({ name: body.name || 'file', type: body.type || 'application/octet-stream', size: body.size || 0 });
      }
      // Blob body (fetch with blob)
      else if (typeof Blob !== 'undefined' && body instanceof Blob) {
        if ((body.type || '').indexOf('image/') === 0) imageFiles.push({ name: body.name || 'blob', type: body.type || 'image', size: body.size || 0 });
      }
      // String bodies may contain data URIs or base64-encoded images
      else if (typeof body === 'string') {
        if (body.indexOf('data:image/') !== -1 || /base64,/.test(body) || /Content-Disposition:/i.test(body) || /filename=/.test(body)) {
          imageFiles.push({ name: 'string-body', type: 'text', size: body.length });
        }
      }
    } catch (_err) {
      // Silently fail - don't break the upload
      return imageFiles;
    }

    return imageFiles;
  }

  function dispatchImageEvent(imageFile, reason) {
    try {
      window.dispatchEvent(
        new CustomEvent("sentinel:image-pending-send", {
          detail: {
            filename: imageFile.name,
            filetype: imageFile.type,
            filesize: imageFile.size,
            reason: reason || "image about to be sent"
          }
        })
      );
    } catch (_err) {
      // Silently fail
    }
  }

  // Request/response queue for uploaded files: page-guard will dispatch a requestId
  var __pgai_pending = new Map();
  var __pgai_counter = 0;

  function requestUploadApproval(imageFile, reason, timeoutMs) {
    timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 15000;
    try {
      var requestId = 'pgai-' + (++__pgai_counter) + '-' + Date.now();
      // Dispatch the pending-send event including a requestId so content script can respond
      window.dispatchEvent(
        new CustomEvent('sentinel:image-pending-send', {
          detail: {
            filename: imageFile.name,
            filetype: imageFile.type,
            filesize: imageFile.size,
            reason: reason || 'image about to be sent',
            requestId: requestId
          }
        })
      );

      return new Promise(function (resolve) {
        var entry = { resolve: resolve };
        __pgai_pending.set(requestId, entry);
        // auto-allow after timeout to avoid breaking behavior
        entry.timeout = setTimeout(function () {
          if (__pgai_pending.has(requestId)) {
            try { __pgai_pending.get(requestId).resolve({ allowed: true, reason: 'timeout' }); } catch (e) {}
            __pgai_pending.delete(requestId);
          }
        }, timeoutMs);
      });
    } catch (e) {
      return Promise.resolve({ allowed: true, reason: 'dispatch-error' });
    }
  }

  // Listen for decisions from content script (Allow / Deny)
  window.addEventListener('sentinel:image-send-decision', function (ev) {
    try {
      var d = ev && ev.detail ? ev.detail : null;
      if (!d || !d.requestId) return;
      var entry = __pgai_pending.get(d.requestId);
      if (!entry) return;
      clearTimeout(entry.timeout);
      try { entry.resolve({ allowed: !!d.allowed, reason: 'user' }); } catch (e) {}
      __pgai_pending.delete(d.requestId);
    } catch (_err) {
      // ignore
    }
  }, false);

  // Clean up pending promises on navigation to prevent memory leaks
  window.addEventListener('beforeunload', function () {
    __pgai_pending.forEach(function (entry) {
      try { clearTimeout(entry.timeout); } catch (_) {}
      try { entry.resolve({ allowed: true, reason: 'navigation' }); } catch (_) {}
    });
    __pgai_pending.clear();
  });

  // Hook FileReader to detect when image files are being read
  var originalFileReaderRead = FileReader.prototype.readAsDataURL;
  FileReader.prototype.readAsDataURL = function(blob) {
    try {
      if (blob && isScannableFile(blob)) {
        var imageFile = {
          name: blob.name || "file",
          type: blob.type || "application/octet-stream",
          size: blob.size || 0
        };
        var reason = isSensitiveFilename(imageFile.name)
          ? "filename heuristic: " + imageFile.name
          : "image file: " + imageFile.name;
        dispatchImageEvent(imageFile, reason);
      }
    } catch (_err) {
      // Silently fail - don't break FileReader
    }
    return originalFileReaderRead.call(this, blob);
  };

  // Hook fetch API
  var originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function () {
      var args = arguments;
      var that = this;
      try {
        var input = args[0];
        var init = args[1] || {};
        var requestBody = init.body;

        // If the Request object contains form data, inspect it asynchronously
        if (!requestBody && typeof Request !== "undefined" && input instanceof Request) {
          try {
            // Prefer formData detection first (common for file uploads)
            return input.clone().formData().then(function (fd) {
              var imageFiles = getImageFilesFromBody(fd);
              if (imageFiles.length > 0) {
                return requestUploadApproval(imageFiles[0], 'fetch upload').then(function (decision) {
                  if (decision && decision.allowed) {
                    return originalFetch.apply(that, args);
                  }
                  return Promise.reject(new Error('PGAI blocked upload'));
                });
              }
              // If not formData, try blob detection
              return input.clone().blob().then(function (blob) {
                try {
                  if (blob && (blob.type || '').indexOf('image/') === 0) {
                    return requestUploadApproval({ name: blob.name || 'request-blob', type: blob.type, size: blob.size }, 'fetch upload').then(function (decision) {
                      if (decision && decision.allowed) {
                        return originalFetch.apply(that, args);
                      }
                      return Promise.reject(new Error('PGAI blocked upload'));
                    });
                  }
                } catch (_e) {}
                // Fallback: try textual inspection (data URIs embedded in JSON/text)
                return input.clone().text().then(function (text) {
                  try {
                    if (typeof text === 'string' && (text.indexOf('data:image/') !== -1 || /filename=/.test(text) || /Content-Disposition:/i.test(text) || (/base64,/.test(text) && text.length > 500))) {
                      return requestUploadApproval({ name: 'request-body', type: 'text', size: text.length }, 'fetch upload').then(function (decision) {
                        if (decision && decision.allowed) {
                          return originalFetch.apply(that, args);
                        }
                        return Promise.reject(new Error('PGAI blocked upload'));
                      });
                    }
                  } catch (_e) {}
                  return originalFetch.apply(that, args);
                }).catch(function () { return originalFetch.apply(that, args); });
              }).catch(function () { return originalFetch.apply(that, args); });
            }).catch(function () {
              return originalFetch.apply(that, args);
            });
          } catch (_e) {
            // fall through to normal path
          }
        }

        // request body directly provided in init (FormData / Blob / String)
        if (requestBody instanceof FormData) {
          var imageFiles = getImageFilesFromBody(requestBody);
          if (imageFiles.length > 0) {
            return requestUploadApproval(imageFiles[0], 'fetch upload').then(function (decision) {
              if (decision && decision.allowed) {
                return originalFetch.apply(that, args);
              }
              return Promise.reject(new Error('PGAI blocked upload'));
            });
          }
        } else if (typeof Blob !== 'undefined' && requestBody instanceof Blob) {
          try {
            if ((requestBody.type || '').indexOf('image/') === 0) {
              return requestUploadApproval({ name: requestBody.name || 'blob', type: requestBody.type, size: requestBody.size }, 'fetch upload').then(function (decision) {
                if (decision && decision.allowed) {
                  return originalFetch.apply(that, args);
                }
                return Promise.reject(new Error('PGAI blocked upload'));
              });
            }
          } catch (_e) {}
        } else if (typeof requestBody === 'string') {
          try {
            if (requestBody.indexOf('data:image/') !== -1 || /base64,/.test(requestBody) || /filename=/.test(requestBody)) {
              return requestUploadApproval({ name: 'string-body', type: 'text', size: requestBody.length }, 'fetch upload').then(function (decision) {
                if (decision && decision.allowed) {
                  return originalFetch.apply(that, args);
                }
                return Promise.reject(new Error('PGAI blocked upload'));
              });
            }
          } catch (_e) {}
        }
      } catch (_err) {
        // Silently fail - don't break fetch
      }

      return originalFetch.apply(this, arguments);
    };
  }

  // Hook XMLHttpRequest
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    var xhr = this;
    var args = arguments;
    try {
      var imageFiles = getImageFilesFromBody(body);
      if (imageFiles.length > 0) {
        // Wait for user approval before sending
        requestUploadApproval(imageFiles[0], 'xhr upload').then(function (decision) {
          if (decision && decision.allowed) {
            originalSend.apply(xhr, args);
          } else {
            try { xhr.abort(); } catch (_) {}
            try { xhr.dispatchEvent(new Event('error')); } catch (_) {}
          }
        }).catch(function () {
          // On error, allow to proceed to avoid breaking pages
          originalSend.apply(xhr, args);
        });
        return;
      }
      // Detect Blob/File body directly (xhr.send(new Blob(...)))
      try {
        if (typeof Blob !== 'undefined' && body instanceof Blob) {
          if ((body.type || '').indexOf('image/') === 0) {
            requestUploadApproval({ name: body.name || 'blob', type: body.type, size: body.size }, 'xhr upload').then(function (decision) {
              if (decision && decision.allowed) {
                originalSend.apply(xhr, args);
              } else {
                try { xhr.abort(); } catch (_) {}
                try { xhr.dispatchEvent(new Event('error')); } catch (_) {}
              }
            }).catch(function () { originalSend.apply(xhr, args); });
            return;
          }
        }
        // Detect string bodies containing data URIs
        if (typeof body === 'string' && (body.indexOf('data:image/') !== -1 || /base64,/.test(body) || /filename=/.test(body))) {
          requestUploadApproval({ name: 'string-body', type: 'text', size: body.length }, 'xhr upload').then(function (decision) {
            if (decision && decision.allowed) {
              originalSend.apply(xhr, args);
            } else {
              try { xhr.abort(); } catch (_) {}
              try { xhr.dispatchEvent(new Event('error')); } catch (_) {}
            }
          }).catch(function () { originalSend.apply(xhr, args); });
          return;
        }
      } catch (_e) {}
    } catch (_err) {
      // Silently fail - don't break XHR
    }

    return originalSend.call(this, body);
  };

  // Hook navigator.sendBeacon to catch fire-and-forget uploads containing files.
  try {
    var originalSendBeacon = (navigator && navigator.sendBeacon) ? navigator.sendBeacon.bind(navigator) : null;
    if (typeof originalSendBeacon === 'function') {
      navigator.sendBeacon = function (url, data) {
        try {
          var imageFiles = getImageFilesFromBody(data);
          if (imageFiles.length > 0) {
            // We cannot block synchronously while waiting for user input, so return false
            // (indicates failure) and attempt the upload via fetch if the user later allows.
            requestUploadApproval(imageFiles[0], 'sendBeacon upload').then(function (decision) {
              if (decision && decision.allowed) {
                try { fetch(url, { method: 'POST', body: data, keepalive: true }); } catch (_e) {}
              }
            }).catch(function () {
              // on error, do nothing to avoid breaking the page
            });
            return false;
          }
        } catch (_err) {
          // ignore
        }

        try { return originalSendBeacon(url, data); } catch (_e) { return false; }
      };
    }
  } catch (_e) {
    // ignore
  }

  // Hook FormData.append to detect when files/blobs are attached (early signal)
  try {
    var __pgai_origFormDataAppend = FormData.prototype.append;
    FormData.prototype.append = function (name, value) {
      try {
        if (typeof File !== 'undefined' && value instanceof File) {
          dispatchImageEvent({ name: value.name || 'file', type: value.type || 'image', size: value.size || 0 }, 'formdata.append');
        } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
          if ((value.type || '').indexOf('image/') === 0) {
            dispatchImageEvent({ name: value.name || 'blob', type: value.type || 'image', size: value.size || 0 }, 'formdata.append');
          }
        } else if (typeof value === 'string' && (value.indexOf('data:image/') !== -1 || /base64,/.test(value))) {
          dispatchImageEvent({ name: 'formdata-string', type: 'text', size: value.length }, 'formdata.append');
        }
      } catch (_e) {}
      return __pgai_origFormDataAppend.apply(this, arguments);
    };
  } catch (_e) {
    // ignore
  }
  
  // Override HTMLFormElement.submit to pause and request approval for file uploads
  try {
    var __pgai_origFormSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      try {
        var form = this;
        var fileInputs = form.querySelectorAll ? Array.from(form.querySelectorAll("input[type='file']")) : [];
        var firstFile = null;
        for (var i = 0; i < fileInputs.length; i++) {
          var fi = fileInputs[i];
          if (fi && fi.files && fi.files.length > 0) {
            firstFile = fi.files[0];
            break;
          }
        }
        if (firstFile) {
          // Pause the submit and request approval for the first file found
          requestUploadApproval(firstFile, 'form submit').then(function (decision) {
            if (decision && decision.allowed) {
              try { __pgai_origFormSubmit.apply(form); } catch (e) { try { form.submit(); } catch (_) {} }
            } else {
              try {
                for (var j = 0; j < fileInputs.length; j++) {
                  try { fileInputs[j].value = ''; } catch (_e) {}
                }
              } catch (_e) {}
            }
          }).catch(function () {
            try { __pgai_origFormSubmit.apply(form); } catch (e) {}
          });
          return;
        }
      } catch (_err) {
        // ignore
      }
      return __pgai_origFormSubmit.apply(this, arguments);
    };
  } catch (_e) {
    // ignore
  }

  // Hook WebSocket.prototype.send to detect file-like payloads (data URIs, Blobs, ArrayBuffers)
  try {
    var __pgai_origWSSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        var isSuspicious = false;
        var info = { name: 'websocket-payload', type: typeof data, size: 0 };
        if (typeof data === 'string') {
          if (data.indexOf('data:image/') !== -1 || data.indexOf('base64,') !== -1) isSuspicious = true;
          info.size = data.length;
        } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
          if ((data.type || '').indexOf('image/') === 0) isSuspicious = true;
          info.size = data.size || 0;
        } else if (typeof ArrayBuffer !== 'undefined' && (data instanceof ArrayBuffer || ArrayBuffer.isView && ArrayBuffer.isView(data))) {
          try { info.size = data.byteLength || data.length || 0; } catch (e) { info.size = 0; }
        }

        var ws = this;
        if (isSuspicious) {
          // Pause the send until user decision
          requestUploadApproval(info, 'websocket send').then(function (decision) {
            if (decision && decision.allowed) {
              try { __pgai_origWSSend.call(ws, data); } catch (e) {}
            } else {
              // drop silently
            }
          }).catch(function () {
            try { __pgai_origWSSend.call(ws, data); } catch (e) {}
          });
          return;
        }
      } catch (_e) {
        // ignore and fall through
      }
      return __pgai_origWSSend.apply(this, arguments);
    };
  } catch (_e) {
    // ignore
  }
})();
