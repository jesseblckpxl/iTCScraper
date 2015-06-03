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
  var maxtimeOutMillis = timeOutMillis ? timeOutMillis : 5000, //< Default Max Timout is 5s
    start = new Date().getTime(),
    condition = false,
    interval = setInterval(function() {
      if ( (new Date().getTime() - start < maxtimeOutMillis) && !condition ) {
        // If not time-out yet and condition not yet fulfilled
        condition = (typeof(testFx) === "string" ? eval(testFx) : testFx()); //< defensive code
      } else {
        if(!condition) {
          // If condition still not fulfilled (timeout but condition is 'false')
          console.log("'waitFor()' timeout");
          phantom.exit(1);
        } else {
            // Condition fulfilled (timeout and/or condition is 'true')
            console.log("'waitFor()' finished in " + (new Date().getTime() - start) + "ms.");
            typeof(onReady) === "string" ? eval(onReady) : onReady(); //< Do what it's supposed to do once the condition is fulfilled
            clearInterval(interval); //< Stop this interval
        }
      }
    }, 250); //< repeat check every 250ms
};

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

  //debugging purposes
  console.log(name);

  // add condition to check if sign in was successful use window.location.href to verify?
  state = "apps";
  return state;
}

// Navigate to Apps page
function navToMyApps(){
  //debugging
  console.log("Currently on: " + page.url + " in navToMyApps.");

  state = evaluate(page, function(){
    window.location.href = "https://itunesconnect.apple.com/WebObjects/iTunesConnect.woa/ra/ng/app";
    return "appId";
  });
}

function navToApp(){
  // debugging
  console.log("Currently on: " + page.url + " in goToApp");
  // Setting time out to wait for page to finish loading so that we can find the right element and link
  // TO-DO: write function to check for all elements to have loaded instead of using setTimeOut
  setTimeout(function(){
    page.render("appslist.jpg");
    state = evaluate(page, function(app_name){
      var app = "'" + app_name + "'";
      var el = $("a:contains(" + app + ")")[0];
      if (el != null){
        window.location.href = el.href;
      }
      return "preRelease";
    }, app_name);
  }, 10000);
}

function navToPreRelease(){
  //debugging
  console.log("Currently on: " + page.url + " in preRelease");

  setTimeout(function(){
    //debugging
    page.render("ontheapp.jpg");

    state = page.evaluate(function(){
      var preReleaseTab = $("a:contains('Prerelease')")[0];
      if (preReleaseTab != null){
        window.location.href = preReleaseTab.href;
      }
      return "betaReview";
    });
  }, 5000);
}

function checkBetaReview(){
  // check if test flight beta testing button is on or off
  // if on proceed, if off turn on
  console.log("Currently on: " + page.url + " in betaReview()");

  //check versions? should i have functionality to release older versions? or should i default to
  //releasing the latest version

  //click on submit to beta app review  --> this takes us to the page that has all the information. assume filled out? or allow
  //user to fill out via CLI?
  setTimeout(function(){
    page.render("button.jpeg");

/*
var betaTesting = page.evaluate(function(){
var el = document.getElementsByClassName("bt-internal")[1];
return el;
});

console.log(betaTesting.textContent);
var str = betaTesting.textContent;
var index = str.indexOf("Inactive");
console.log(index);

if (index > -1){
console.log("Beta Testing switch is off, turning on");
//toggle on testflight beta testing
var betaButton = page.evaluate(function(){
var el = document.getElementById("testing-2_0");
return el;
});

page.sendEvent('click', betaButton.offsetLeft, betaButton.offsetTop, 'left');


}else{
console.log("Beta Testing switch is on.");
//hit submit to beta app review link?
}
*/

    var betaTestingOn = evaluate(page, function(app_version){
      //Check the TestFlight Beta Testing button
      var el = $(":input:checkbox[id=" + "testing-" + app_version + "]").prop('checked');
      return el;
    }, app_version);

    console.log(betaTestingOn);

    if(betaTestingOn){
      console.log("Beta testing is on");
      //click on Submit For Beta App Review button
      page.evaluate(function(){
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
    }else{
      console.log("Beta testing is off.");
      //Turn on TestFlight Beta Testing
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
        var button = $("a[for=" + "testing-" + app_version + "]")[0];
        click(button);
      }, app_version);
    }
    page.render("after-buttonclick.jpeg");
  }, 10000);
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
