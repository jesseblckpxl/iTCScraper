var page = require( 'webpage' ).create();
var system = require('system');
var state = "login";

//versions should use underscore , e.g. 2.0.1 -> 2_0_1
var user_name, user_password, app_name, app_version;

function evaluate(page, func) {
  var args = [].slice.call(arguments, 2);
  var fn = "function() { return (" + func.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return page.evaluate(fn);
}

page.onError = function(msg, trace) {
  console.log("LOGGING ERROR \n" +  msg);
  if (trace && trace.length){
    trace.forEach(function(t){
      console.log("trace: " + t.file + ": " + t.line + " " + (t.function ? t.function : "") );
    });
  }
};

function waitFor(testFx, onReady, timeOutMillis) {
  var maxtimeOutMillis = timeOutMillis ? timeOutMillis : 15000, //< Default Max Timout is 15s
    start = new Date().getTime(),
    condition = false,
    interval = setInterval(function() {
      if( (new Date().getTime() - start < maxtimeOutMillis) && !condition ) {
        // If not time-out yet and condition not yet fulfilled
        condition = (typeof(testFx) === "string" ? eval(testFx) : testFx()); //< defensive code
      }else{
        if(!condition) {
          // If condition still not fulfilled (timeout but condition is 'false')
          console.log("'waitFor()' timeout");
          phantom.exit(1);
        }else{
          // Condition fulfilled (timeout and/or condition is 'true')
          console.log("'waitFor()' finished in " + (new Date().getTime() - start) + "ms.");
          typeof(onReady) === "string" ? eval(onReady) : onReady(); //< Do what it's supposed to do once the condition is fulfilled
          clearInterval(interval); //< Stop this interval
        }
      }
    }, 250); //< repeat check every 250ms
}

function signIn(){
  //Get iTunes connect username and password through command line arguments
  for (var i = 1; i < system.args.length; i++){
    if (i == 1){
      user_name = system.args[1];
      //debugging
      console.log(user_name);
    }else if (i == 2){
      user_password = system.args[2];
    }else if (i == 3){
      app_name =system.args[3];
      console.log(app_name);
    }else if (i == 4){
      app_version = system.args[4];
      console.log(app_version);
    }
  }

  //Sign into iTunes connect with user_name & password
  if (user_name && user_password){
    var name = evaluate(page, function(user_name, user_password){
      var account_name = document.getElementById('accountname');
      if (account_name){
        account_name.value = user_name;
        var password = document.getElementById("accountpassword");
        password.value = user_password;
        document.forms[0].submit();
      }
      return account_name.value;
    }, user_name, user_password);
  }
  console.log(name);
  //TO-DO: add check for login success/failure
  state = "apps";
  return state;
}

// Navigate to Apps page
function navToMyApps(){
  console.log("Currently on: " + page.url + " in navToMyApps.");
  state = evaluate(page, function(){
    window.location.href = "https://itunesconnect.apple.com/WebObjects/iTunesConnect.woa/ra/ng/app";
    return "appId";
  });
}

function navToApp(){
  console.log("Currently on: " + page.url + " in navToApp");
  waitFor(function(){
    //make sure that elements for apps have loaded
    return page.evaluate(function(){
        return $("#session-menu").is(":visible");
      });
    },
    function(){
      state = evaluate(page,function(app_name){
        var el = $("a:contains(" + app_name + ")")[0];
        window.location.href = el.href;
        return "preRelease";
      },app_name);
    }
  );
}

function navToPreRelease(){
  console.log("Currently on: " + page.url + " in preRelease");
  waitFor(
    function(){
      //Check that page has loaded
      return page.evaluate(function(){
        return $(".overview").is(":visible");
      });
    },
    function(){
      page.render("on-the-app.jpg");
      state = page.evaluate(function(){
        var preReleaseTab = $("a:contains('Prerelease')")[0];
        if (preReleaseTab != null){
          window.location.href = preReleaseTab.href;
        }
        return "betaReview";
      });
    }
  );
}

function checkBetaReview(){
  // check if test flight beta testing button is on or off
  // if on proceed, if off turn on
  console.log("Currently on: " + page.url + " in betaReview()");
  waitFor(
    function(){
      return evaluate(page, function(app_version){
        return $("a:contains('TestFlight Beta Testing')")[0];
      }, app_version) !== null;
    },
    function(){
      //Check to see if Testflight Beta Testing is on for the desired version
      var betaTestingOn = evaluate(page, function(app_version){
        return $(":input:checkbox[id=" + "testing-" + app_version + "]").prop('checked');
      }, app_version);
      console.log("Beta Testing is on: " + betaTestingOn);
      if (!betaTestingOn){
        console.log("Turning on Testflight beta testing");
        page.render("testflight-off.jpg");
        evaluate(page, function(app_version){
          function click(elem){
            var ev = document.createEvent('MouseEvent');
            ev.initMouseEvent(
             'click',
              true /* bubble */, true /* cancelable */,
              window, null,
              0, 0, 0, 0, /* coordinates */
              false, false, false, false, /* modifier keys */
              0 /*left*/, null
            )
            elem.dispatchEvent(ev);
          };
          //get the TestFlight Beta Testing toggle button
          var tfButton = $("a[for=" + "testing-" + app_version + "]")[0];
          click(tfButton);
        }, app_version);
      }
      console.log("Clicking submit for review link.");
      //click on Submit For Beta App Review button
      waitFor(
        function(){
          return page.evaluate(function(){
            return $("a:contains('Submit for Beta App Review')").is(":visible");
          });
        },
        function(){
          page.render("submit-for-beta-link-activated.jpg");
          page.evaluate(function(){
            //No need to check for version since only 1 version can be active for Testflight at a time.
            var submit = $("a:contains('Submit for Beta App Review')")[0];
            if (submit !== null){
              function click(elem){
                var ev = document.createEvent('MouseEvent');
                ev.initMouseEvent(
                  'click',
                  true /* bubble */, true /* cancelable */,
                  window, null,
                  0, 0, 0, 0, /* coordinates */
                  false, false, false, false, /* modifier keys */
                  0 /*left*/, null
                );
                elem.dispatchEvent(ev);
              }
              click(submit);
            }
          });
        }
      );
      //Now on Build Information section for app
      waitFor(
        function(){
          //wait for page to load
          return page.evaluate(function(){
            return $(".fileIconWrapper").is(":visible");
          });
        },
        function(){
          page.render("build-info.jpg");
        }
      );
    }
  );
}

function appInfoForm(){
  setTimeout(function(){
    page.render("Start_external_testing.jpeg");
  }, 5000);
}

page.onLoadFinished = function(status){
  switch (state){
    case "apps":
      navToMyApps();
      break;
    case "appId":
      navToApp();
      break;
    case "preRelease":
      navToPreRelease();
      break;
    case "betaReview":
      checkBetaReview();
      break;
    default:
      state = signIn();
      console.log("State = default.");
  }
};

page.open("https://itunesconnect.apple.com/WebObjects/iTunesConnect.woa");
