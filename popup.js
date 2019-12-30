var NUM_STATUS_PER_PAGE = 20;
var STATUS_URL = 'http://status.renren.com/GetSomeomeDoingList.do';


function parseAlbumListResponse(responseData) {
	var regex = /'albumList':\s*(\[.*?\]),/g;
	var albumsRaw = responseData.match(regex)[0];
	albumsRaw = albumsRaw.split("'albumList': ")[1];
	albumsRaw = albumsRaw.substring(0, albumsRaw.lastIndexOf(","));
	try {
		var dataJson = JSON.parse(albumsRaw);
	} catch (err) {
		console.log("error parsing json");
	}
	return dataJson;
}

function parseAlbumResponse(responseData) {
	var regex = /"url":"(.*?)"/g;
	var imageListRaw = responseData.match(regex);
	if (imageListRaw == null) {
		return [];
	}
	var imageUrlList = [];
	for (var i = 0; i < imageListRaw.length; i++) {
		var raw = imageListRaw[i];
		raw = raw.split('url":"')[1];
		raw = raw.split('"')[0];
		raw = raw.replace(/\\/g, "");
		imageUrlList.push(raw);
	}
	return imageUrlList;
}

function parseAlbumResponsePaged(responseData) {
	var urlList = []

	var photoList = responseData.photoList;
	if (!photoList) {
		return urlList;
	}
	photoList.forEach(function(item) {
		urlList.push(item.url);
	})
	return urlList;
}

function getStatusSummary(userId, page, callback) {
	$.ajax({
		url: STATUS_URL,
		data: {
			"userId": userId,
			"curpage": page,
		},
		dataType: "json",
		success: function(data) {
			var summary = "";
			for (var idx in data["doingArray"]) {
				var statusItem = data["doingArray"][idx];
				// Skip reposts
				var rootUserId = statusItem["rootDoingUserId"];
				var invalidCode = statusItem["code"];
				if ((rootUserId && rootUserId != userId) || invalidCode) {
					continue;
				}
				var content = statusItem["content"];
				var cleanedContent = content.replace(/<[^>]*>/g, '').trim();
				summary += cleanedContent + "\t" + statusItem["dtime"] + "\n";
			}
			callback(null, summary);
		},
		error: function (jqXHR, status, err) {
        	console.log("get status error");
        	callback(err, null);
        }
	});
}

function getUserStatusDataAsync(userId, fileDir, callback) {
	$('#statusProgress').text("状态检测中");

	// compute the number of pages
	$.ajax({
		url: STATUS_URL,
		data: {
			"userId": userId,
			"curpage": 0,
		},
		dataType: "json",
		success: function(firstPageData) {
			var totalStatusCount = firstPageData.count;
			var numPages = Math.ceil(totalStatusCount / NUM_STATUS_PER_PAGE);

			async.map([...Array(numPages).keys()], function(page, callback) {
			    getStatusSummary(userId, page, function (err, res) {
			        if (err) {
			        	return callback(err, null);
			        }
			        $('#statusProgress').attr("data-badge", page + 1);
			        callback(null, res);
			    })
			}, function(err, results) {
			    if (err) {
					console.log("error " + err);
				}
				var statusSummary = "";
				for (var idx in results) {
					statusSummary += results[idx];
				}
				fileDir.file("状态.txt", statusSummary);
				$('#statusProgress').text("状态检测完成").addClass("text-success");

				callback();
			});
		},
		error: function (jqXHR, status, err) {
        	console.log("get first status page error");
        	$('#statusProgress').text("状态检测失败").addClass("text-error");
        	callback(err, null);
        }
	});
}

function getBlogContent(userId, blogId, callback) {
	var blogDetailUrl = 'http://blog.renren.com/blog/' + userId + '/' + blogId;
	$.ajax({
		url: blogDetailUrl,
		success: function(data) {
			var blogContent = $('#blogContent', data);
			if (!blogContent || !blogContent[0]) {
				return callback(null, null);
			}
			callback(null, blogContent[0].innerText.trim());
		},
		error: function (jqXHR, status, err) {
        	console.log("get blog content error");
        	callback(err, null);
        }
	});
}

function getBlogPage(blogListUrl, userId, page, fileDir, callback) {
	$.ajax({
		url: blogListUrl,
		data: {
			"curpage": page,
		},
		dataType: "json",
		success: function(data) {
			async.map(data.data, function(blogData, callback) {
			    var blogItem = blogData;
				var blogId = blogItem.id;
				var createTime = blogItem.createTime;
				var title = blogItem.title;

				getBlogContent(userId, blogId, function(err, res) {
					if (err) {
						console.log("get blog content error");
						return callback();
					}
					var summary = title + "\n" + createTime + "\n" + res + "\n";
					fileDir.file(title + ".txt", summary);
					callback();
				});
			}, function(err, results) {
			    if (err) {
					console.log("get blog content error " + err);
				}
				$('#blogProgress').attr("data-badge", page + 1);
				callback();
			});
		},
		error: function (jqXHR, status, err) {
        	console.log("get blog page error");
        	callback(err, null);
        }
	});
}

function getUserBlogDataAsync(userId, fileDir, callback) {
	$('#blogProgress').text("日志检测中");

	var blogListUrl = 'http://blog.renren.com/blog/' + userId + '/blogs';

	// compute the number of pages
	$.ajax({
		url: blogListUrl,
		data: {
			"curpage": 0,
		},
		dataType: "json",
		success: function(firstPageData) {
			var totalBlogCount = firstPageData.count;
			var numPages = Math.ceil(totalBlogCount / NUM_STATUS_PER_PAGE);

			var statusSummary = "";

			async.map([...Array(numPages).keys()], function(page, callback) {
			    getBlogPage(blogListUrl, userId, page, fileDir, function (err, res) {
			        if (err) {
			        	return callback(err);
			        }
			        callback(null, res);
			    })
			}, function(err, results) {
			    if (err) {
					console.log("error " + err);
				}
				$('#blogProgress').text("日志检测完成").addClass("text-success");
				callback();
			});
		},
		error: function (jqXHR, status, err) {
        	console.log("get first blog page error");
        	$('#blogProgress').text("日志检测失败").addClass("text-error");
        	callback(err, null);
        }
	});
}

function getPhotoDataAsync(photoUrl, callback) {
	$.ajax({
		url: photoUrl,
		dataType:"binary",
		tryCount : 0,
		retryLimit : 3,
		xhr:function() {
            var xhr = new XMLHttpRequest();
            xhr.responseType= 'blob'
            return xhr;
        },
        success: function(data) {
            callback(null, data);
        },
        error: function (jqXHR, status, err) {
        	this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
                //try again
                $.ajax(this);
                return;
            }

        	console.log("async download photo error url " + photoUrl);
        	callback(err, null);
        }
	});
}

function getAlbumDataAsync(albumName, photoUrls, fileDir, callback) {
	var albumDir = fileDir.folder(albumName);

	var downloadCount = 0;

	async.map(photoUrls, function(photoUrl, callback2) {
	    var photoName = photoUrl.substring(photoUrl.lastIndexOf("/") + 1, photoUrl.length);
	    getPhotoDataAsync(photoUrl, function(err, res) {
    		if (err) {
    			console.log("getPhotoData error " + err);
    			callback2(err, null);
    		}
    		callback2(null, [photoName, res]);
    	});
	}, function(err, results) {
	    if (err) {
			console.log("error " + err);
		}
		results.forEach(function(res) {
			if (!res) {
				return;
			}
			var photoName = res[0];
			var photoData = res[1];
			if (!photoData) {
				console.log("photodata empty");
				return;
			}
			albumDir.file(photoName, photoData, {binary:true});
		});
		callback();
	});
}

function getAlbumListInfoAsync(userId, callback) {
	var albumListUrl = 'http://photo.renren.com/photo/' + userId + '/albumlist/v7?limit=100';
	$.ajax({
		url: albumListUrl,
		success: function(data){
			var albumListJson = parseAlbumListResponse(data);
			albumPhotoUrlDict = {};

			async.map(albumListJson, function(album, callback) {
			    if ((album['sourceControl'] == 0 || album['sourceControl'] == 99 || album['sourceControl'] == -1) && album['photoCount'] > 0) {
					var firstPageUrl = 'http://photo.renren.com/photo/' + album['ownerId'] + '/' + 'album-' + album['albumId'] + '/bypage/ajax/v7?page=1&pageSize=100';
					var albumUrls = [firstPageUrl];
					if (album['photoCount'] > 100) {
						var secondPageUrl = 'http://photo.renren.com/photo/' + album['ownerId'] + '/' + 'album-' + album['albumId'] + '/bypage/ajax/v7?page=2&pageSize=100';
						albumUrls.push(secondPageUrl);
					}

					async.map(
						albumUrls,
						function(albumUrl, callback2) {
							var albumResponseData = $.ajax({
								url: albumUrl,
								dataType: "json",
								tryCount : 0,
								retryLimit : 5,
								success: function(albumResponseData) {
									var imageUrlList = parseAlbumResponsePaged(albumResponseData);
									callback2(null, imageUrlList);
								},
								error: function(jqXHR, status, err) {
									this.tryCount++;
						            if (this.tryCount <= this.retryLimit) {
						                //try again
						                $.ajax(this);
						                return;
						            }
						            // return;
									console.log('get album response data failed');
									callback2(err, []);
						        }
							});
						},
						function(err, results) {
							if (err) {
								console.log('get album url list failed');
								callback(err, {});
							}
							var imageUrlList = []
							for (idx in results) {
								imageUrlList = imageUrlList.concat(results[idx]);
							}

							albumPhotoUrlDict[album['albumName']] = imageUrlList;
							callback();
						}
					);
				} else {
					callback();
				}
			}, function(err, results) {
			    if (err) {
					console.log("getAlbumListInfoAsync error " + err);
				}
				callback(null, albumPhotoUrlDict);
			});
		},
		error: function(jqXHR, status, err) {
        	console.log("getAlbumListInfoAsync error");
        	callback(err, {});
        }
	});
}

function getTaggedPhotoDataAsync(userId, callback) {
	var taggedAlbumUrl = 'http://photo.renren.com/photo/' + userId + '/tag/v7';

	$.ajax({
		url: taggedAlbumUrl,
		success: function(data) {
			var taggedPhotoUrls = parseAlbumResponse(data);
			callback(null, {"被圈照片": taggedPhotoUrls});
		},
		error: function(jqXHR, status, err) {
        	console.log("getTaggedPhotoDataAsync error");
        	callback(err, {});
        }
	});
}

function getUserPhotoDataAsync(userId, fileDir, callback) {
	$('#photoProgress').text("照片检测中");

	async.parallel([
	    function(callback) {
			getAlbumListInfoAsync(userId, callback);
	    },
	    function(callback) {
			getTaggedPhotoDataAsync(userId, callback);
	    },
	],
	function(err, results) {
		var albumData =  {};
		for (var idx in results) {
			albumData =  Object.assign(albumData, results[idx]);
		}

    	var numAlbums = Object.keys(albumData).length;
		var downloadedAlbums = 0;
		async.mapSeries(Object.keys(albumData), function(albumName, callback) {
			var photoUrls = albumData[albumName];

			getAlbumDataAsync(albumName, photoUrls, fileDir, callback);
			downloadedAlbums += 1;
			$('#photoProgress').attr("data-badge", downloadedAlbums + "/" + numAlbums);
		}, function(err, results) {
		    if (err) {
				console.log("error " + err);
			}
			$('#photoProgress').text("照片检测完成").addClass("text-success");
			callback();
		});
	});
}

function downloadUserData(userId, userName) {
	// hide download button while downloading
	$('#downloadButton').hide();
	$('#loadingIcon').show();
	$('#statusIcon').removeClass("icon-download").hide();

	var filename = userName + "_" + userId;
	var zip = new JSZip();
	var rootDir = zip.folder(filename);

	var statusDir = rootDir.folder("状态");
	var blogDir = rootDir.folder("日志");
	var photoDir = rootDir.folder("照片");

	async.parallel([
	    function(callback) {
			getUserStatusDataAsync(userId, statusDir, callback);
	    },
	    function(callback) {
			getUserBlogDataAsync(userId, blogDir, callback);
	    },
	    function(callback) {
	    	getUserPhotoDataAsync(userId, photoDir, callback);
	    }
	],
	function(err, results) {
    	// Save file
		zip.generateAsync({type: "blob"}).then(function(content) {
			saveAs(content, filename + ".zip");
		});

		$('#loadingIcon').hide();
		$('#statusIcon').addClass("icon-check").show();
		$('#completeText').show();

	});
	
}

$(function() {

	chrome.tabs.query({active:true,currentWindow: true}, function(tabs) {
		var currentUrl = tabs[0].url;
		var homePageUrlPattern = /^http:\/\/www.renren.com\/(\d*)\/profile/;
		if (homePageUrlPattern.test(currentUrl)) {
			$('#redirectButton').hide();
			$('#downloadButton').show();
			$('#statusProgress').show();
			$('#blogProgress').show();
			$('#photoProgress').show();

			var userId = currentUrl.match(/\d/g).join("");
			var userName = tabs[0].title.split("-")[1].trim();
			$('#displayText').text(userName);

			$('#downloadButton').click(function() {
	    		downloadUserData(userId, userName);
	    	});

		} else {
			$('#redirectButton').show();
			$('#downloadButton').hide();
			$('#statusProgress').hide();
			$('#blogProgress').hide();
			$('#photoProgress').hide();
			$('#statusIcon').hide();

			$('#displayText').text("现在并不在人人网");

			$('#redirectButton').click(function() {
				console.log('redirectButoon clicked');
				chrome.tabs.create({ url: 'http://www.renren.com/profile' });
			});
		}

    });
    
})
