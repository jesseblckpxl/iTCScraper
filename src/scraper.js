var page = require( 'webpage' ).create();
var system = require('system');
var yaml = require('js-yaml');
var fs = require('fs');
var util = require('util');
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

function click(page, selector, index){
  evaluate(page, function(selector, index){
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
  }, selector, index);
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
    if (i == 1){
      user_name = system.args[1];
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
    return evaluate(page, function(app_name){
        return $("div:contains(" + app_name + ")").is(":visible");
      }, app_name);
    },
    function(){
      state = evaluate(page,function(app_name){
        var el = $("a:contains(" + app_name + ")")[0];
        if (typeof el != null){
          window.location.href = el.href;
          return "preRelease";
        }else{
          throw new Error("Could not find <a> element that contains: " + app_name );
        }
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
        page.render("testflight-off.jpg");
        //Check if another version if enabled for beta testing, if enabled need to handle 'are you sure' pop-up
        var otherVersionOn = page.evaluate(function(){
          var on = false;
          var versions = $(":input:checkbox");
          for (i = 0; i < versions.length; i++){
            if (versions[i].checked){
              on = true;
            }
          }
          return on;
        });
        console.log("There is another version in beta testing: " + otherVersionOn);
        var tFBtn = "a[for=testing-" + app_version + "]";
        click(page, tFBtn, 0);
        if (otherVersionOn) {
          console.log("Handling pop-up.");
          page.render("pop-up.jpg");
          var popUpBtn = "a:contains('Start')";
          click(page, popUpBtn, 0);
        }
      }
      //click on Submit For Beta App Review button
      waitFor(
        function(){
          page.render("pop-up-clicked-hopefully.jpg");
          return evaluate(page, function(app_version){
            return ($(":input:checkbox[id=" + "testing-" + app_version + "]").prop('checked'));
          }, app_version);
        },
        function(){
          page.render("submit-for-beta-link-activated.jpg");
          waitFor(
            function(){
              return page.evaluate(function(){
                return $("a:contains('Submit for Beta App Review')").is(":visible");
              })
            },
            function(){
              console.log("Clicking submit for review.");
              var submitBtn = "a:contains('Submit for Beta App Review')";
              click(page, submitBtn, 0);
              waitFor(
                function(){
                  //wait for page to load
                  page.render("are-we-actually-on-the-build-info-page.jpg");
                  return page.evaluate(function(){
                    return $(".fileIconWrapper").is(":visible");
                  });
                },
                function(){
                  page.render("build-info.jpg");
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
        var file = fs.read('test.yml','utf8');
        var buildInfo = yaml.safeLoad(file);
        console.log(util.inspect(buildInfo, false, 10, true));
        for (var language in buildInfo){
          if (buildInfo.hasOwnProperty(language)){
            console.log(language);
            //Get app information
            var whatToTest = buildInfo[language]."What_to_Test";
            var appDescript = buildInfo[language]."App_Description";
            var notes = buildInfo[language]."Notes";
            var feedbackEmail = buildInfo[language]."Feedback_Email";
            var marketingURL = buildInfo[language]."Marketing_URL";
            var privacyURL = buildInfo[language]."Privacy_Policy_URL";
            var firstName = buildInfo[language]."Contact_First_Name";
            var lastName = buildInfo[language]."Contact_Last_Name";
            var phone = buildInfo[language]."Contact_Phone_Number";
            var email = buildInfo[language]."Contact_Email";
            var demoUser = buildInfo[language]."Demo_User_Name";
            var demoPassword = buildInfo[language]."Demo_Password";
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
            page.render("buildinfo-filled.jpg");
          }
        }
        return true;
      },
      function(){
        waitFor(
          function(){
            //Wait for Submit button to become enabled.
            return page.evaluate(function(){
              return !($("a:contains('Submit')").is(":disabled"));
            });
          },
          function(){
            var submit = "a:contains('Submit')";
            click(page, submit, 0);
            page.render("clicked-on-submit.jpg");
          }
        );
        return state = "compliance";
      }
    );
  }catch(e){
    console.log(e);
    phantom.exit();
  }
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
    case "compliance":
      console.log("exiting...");
      phantom.exit();
    default:
      state = signIn();
      console.log("State = default.");
  }
};

page.open("https://itunesconnect.apple.com/WebObjects/iTunesConnect.woa");
