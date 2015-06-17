var page = require( 'webpage' ).create();
var system = require('system');
var yaml = require('js-yaml');
var fs = require('fs');
var util = require('util');
var state = "login";

/***
* Run: 'phantomjs scraper.js -u user@example.com -p password -n "Some App" -v 1_0_5 -f "~/path/to/file/testflight_appinfo.yml"
* -- required --
* user_name: -u, iTunesConnect username
* user_password: -p, iTunesConnect password
* app_name: -n, App name
* app_version: -v, version to beta test, use underscore to separate digits, e.g. '2.0.1 -> 2_0_1'
* build_info: -f, path to YAML file that contains build information for TestFlight beta information
***/
var user_name, user_password, app_name, app_version, build_info;

function evaluate(page, func) {
  var args = [].slice.call(arguments, 2);
  var fn = "function() { return (" + func.toString() + ").apply(this, " + JSON.stringify(args) + ");}";
  return page.evaluate(fn);
}

function click(page, selector, index){
  var clicked = evaluate(page, function(selector, index){
    var result = {};
    try{
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
      var el = $(selector)[index];
      click(el);
      result.success = true;
    }catch(e){
      result.error = e;
    }
    return result;
  }, selector, index);
  return clicked;
}

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
    if(system.args[i][0] == "-"){
      var value = null;
      if (i + 1 < system.args.length){
        value = system.args[i + 1];
        console.log(value);
      }
      switch (system.args[i][1]){
        case "u":
          user_name = value;
          break;
        case "p":
          user_password = value;
          break;
        case "n":
          app_name = value;
          break;
        case "v":
          app_version = value;
          break;
        case "f":
          build_info = value;
          break;
      }
    }else{
      continue;
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
  //TO-DO: add check for login success/failure
  return state = "apps";
}

// Navigate to My Apps page
function myApps(){
  console.log("Currently on: " + page.url + " in myApps().");
  state = evaluate(page, function(){
    window.location.href = "https://itunesconnect.apple.com/WebObjects/iTunesConnect.woa/ra/ng/app";
    return "appId";
  });
}

function goToApp(){
  console.log("Currently on: " + page.url + " in goToApp()");
  waitFor(
    function(){
      return evaluate(page, function(app_name){
        return $("div:contains(" + app_name + ")").is(":visible"); //make sure app is in view
      }, app_name);
    },
    function(){
      state = evaluate(page,function(app_name){
        var el = $("a:contains(" + app_name + ")")[0];
        if (el){
          window.location.href = el.href;
          return "prerelease";
        }else{
          throw new Error("Could not find <a> element that contains: " + app_name );
        }
      },app_name);
    }
  );
}

function prerelease(){
  console.log("Currently on: " + page.url + " in prerelease()");
  waitFor(
    function(){
      return page.evaluate(function(){
        return $("a:contains('Prerelease')").is(":visible"); // wait for prerelease tab to become visible.
      });
    },
    function(){
      state = page.evaluate(function(){
        var preReleaseTab = $("a:contains('Prerelease')")[0];
        if (preReleaseTab){
          window.location.href = preReleaseTab.href;
        }
        return "betaReview";
      });
    }
  );
}

function betaReview(){
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
        //Check if another version if enabled for beta testing, if enabled need to handle 'are you sure' pop-up
        var otherVersionOn = page.evaluate(function(){
          var betaOn = false;
          var versions = $(":input:checkbox");
          for (i = 0; i < versions.length; i++){
            if (versions[i].checked){
              betaOn = true;
            }
          }
          return betaOn;
        });
        console.log("There is another version in beta testing: " + otherVersionOn);
        var tFBtn = "a[for=testing-" + app_version + "]";
        click(page, tFBtn, 0);
        if (otherVersionOn) {
          console.log("Handling pop-up.");
          var popUpBtn = "a:contains('Start')";  //click 'Start' on pop-up that asks for confirmation for testing new version
          click(page, popUpBtn, 0);
        }
      }
      //click on Submit For Beta App Review button
      waitFor(
        function(){
          return evaluate(page, function(app_version){
            return ($(":input:checkbox[id=" + "testing-" + app_version + "]").prop('checked'));
          }, app_version);
        },
        function(){
          waitFor(
            function(){
              return page.evaluate(function(){
                return $("a:contains('Submit for Beta App Review')").is(":visible");
              });
            },
            function(){
              console.log("Clicking submit for review.");
              var submitBtn = "a:contains('Submit for Beta App Review')";
              click(page, submitBtn, 0);
              waitFor(
                function(){
                  page.render("buildinfo-original.jpg")
                  return page.evaluate(function(){
                    return $(".fileIconWrapper").is(":visible");
                  });
                },
                function(){
                  fillAppInfo();
                }
              , 20000);
            }
          );
        }
      , 25000);
    }
  );
}

function fillAppInfo(){
  try{
    waitFor(
      function(){
        var file = fs.read(build_info,'utf8');
        var buildInfo = yaml.safeLoad(file);
        console.log(util.inspect(buildInfo, false, 10, true));
        for (var language in buildInfo){
          if (buildInfo.hasOwnProperty(language)){
            console.log(language);
            var formLang = page.evaluate(function(){
              return $("a[itc-pop-up-menu='applocalizations']").text(); //get current form language
            });
            if (formLang.indexOf(language) < 0){ // if not on correct language, change form language
              console.log("Clicking dropdown menu to change language to: " + language);
              var langbtn = "td:contains(" + language + ")";
              var checkLang = click(page, langbtn, 0);  //toggle language drop down menu
              if (checkLang.hasOwnProperty("error")){ //make sure language was found and clicked, if not log error
                console.log(language + " not found in dropdown menu.");
                if (checkLang["error"].hasOwnProperty("stack")){
                  console.log(checkLang["error"]["stack"]);
                }
              }
              page.render("langchange-"+ language + ".jpg");
            }
            //Get app information
            var whatToTest = buildInfo[language]["What_to_Test"];
            var appDescript = buildInfo[language]["App_Description"];
            var notes = buildInfo[language]["Notes"];
            var feedbackEmail = buildInfo[language]["Feedback_Email"];
            var marketingURL = buildInfo[language]["Marketing_URL"];
            var privacyURL = buildInfo[language]["Privacy_Policy_URL"];
            var firstName = buildInfo[language]["Contact_First_Name"];
            var lastName = buildInfo[language]["Contact_Last_Name"];
            var phone = buildInfo[language]["Contact_Phone_Number"];
            var email = buildInfo[language]["Contact_Email"];
            var demoUser = buildInfo[language]["Demo_User_Name"];
            var demoPassword = buildInfo[language]["Demo_Password"];
            //Fill out TestFlight Beta Information
            evaluate(page, function(whatToTest, appDescript, notes, feedbackEmail,
              marketingURL, privacyURL, firstName, lastName, phone, email, demoUser, demoPassword){
              $("textarea")[0].value = whatToTest;
              $("textarea")[1].value = appDescript;
              $("textarea")[2].value = notes;
              $("input[ng-model='submitForReviewData.testInfo.details[currentLoc].feedbackEmail.value']")[0].value = feedbackEmail;
              $("input[ng-model='submitForReviewData.testInfo.details[currentLoc].marketingUrl.value']")[0].value = marketingURL;
              $("input[ng-model='submitForReviewData.testInfo.details[currentLoc].privacyPolicyUrl.value']")[0].value = privacyURL;
              $("input[ng-model='submitForReviewData.testInfo.reviewFirstName.value']")[0].value = firstName;
              $("input[ng-model='submitForReviewData.testInfo.reviewLastName.value']")[0].value = lastName;
              $("input[ng-model='submitForReviewData.testInfo.reviewPhone.value']")[0].value = phone;
              $("input[ng-model='submitForReviewData.testInfo.reviewEmail.value']")[0].value = email;
              $("input[ng-model='submitForReviewData.testInfo.reviewUserName.value']")[0].value = demoUser;
              $("input[ng-model='submitForReviewData.testInfo.reviewPassword.value']")[0].value = demoPassword;
            }, whatToTest, appDescript, notes, feedbackEmail, marketingURL, privacyURL,
            firstName, lastName, phone, email, demoUser, demoPassword);
            page.render("buildinfo-filled-" + language + ".jpg");
          }
        }
        return true;
      },
      function(){
        waitFor(
          function(){
            return page.evaluate(function(){
              return !($("a:contains('Submit')").is(":disabled")); // wait for submit button to become enabled.
            });
          },
          function(){
            var submit = "button:contains('Submit')";
            //click(page, submit, 0); // submit for beta app review
            page.render("clicked-on-submit.jpg");
          }
        );
      }
    );
    state = "compliance";
  }catch(e){
    console.log(e);
    phantom.exit();
  }
}

page.onError = function(msg, trace) {
  console.log("LOGGING ERROR \n" +  msg);
  if (trace && trace.length){
    trace.forEach(function(t){
      console.log("trace: " + t.file + ": " + t.line + " " + (t.function ? t.function : "") );
    });
  }
};

page.onLoadFinished = function(status){
  switch (state){
    case "apps":
      myApps();
      break;
    case "appId":
      goToApp();
      break;
    case "prerelease":
      prerelease();
      break;
    case "betaReview":
      betaReview();
      break;
    case "compliance":
      console.log("exiting...");
      phantom.exit();
      break;
    default:
      state = signIn();
      console.log("State = default.");
  }
};

page.open("https://itunesconnect.apple.com/WebObjects/iTunesConnect.woa");
