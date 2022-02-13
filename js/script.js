var tuZeroDate = new Date("1358-08-14T00:00:00.000Z");

var SECOND = 1000;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;

var OONAR_LENGTH_IN_UNS = 96;
var HAKKAR_LENGTH_IN_UNS = 72;

setInterval(function () {
    var nowDate = new Date();
        
    var timeDiffMillis = nowDate.getTime() - tuZeroDate.getTime();
    var timeDiffInHours = Math.floor(timeDiffMillis / HOUR);

    // 1 tu = 8 tols = 16 Coraab days = 1344 Earth hours
    var tu = Math.floor(timeDiffInHours / 1344);

    // 1 gul = 6 tu
    var gul = Math.ceil(tu / 6);
    var tuInGul = (tu % 6) + 1;

    // 1 tol = 2 Coraab days = 168 uns = 168 Earth hours
    var tol = Math.floor((timeDiffInHours % 1344) / (OONAR_LENGTH_IN_UNS + HAKKAR_LENGTH_IN_UNS)) + 1;

    // 1 un = 1 Earth hours
    var unsInTol = (timeDiffInHours % 1344) % (OONAR_LENGTH_IN_UNS + HAKKAR_LENGTH_IN_UNS);
    var uns;
    var day;
    if (unsInTol <= OONAR_LENGTH_IN_UNS) {
        uns = unsInTol + 1;
        day = "OONAR"
    } else {
        uns = unsInTol - OONAR_LENGTH_IN_UNS + 1 ;
        day = "HAKKAR";
    }

    // unt = 5 Earth minutes
    var unt = (Math.floor(timeDiffMillis / (5 * MINUTE))) % 12 + 1;

    // om = 5 Earth seconds
    var om = Math.floor(timeDiffMillis / (5 * SECOND)) % 60 + 1;
    var nextTuInMillis = (tuZeroDate.getTime() + (tu + 1) * 1344 * HOUR) - nowDate.getTime();

    var nextTuIn;
    var nextTuInDays = Math.ceil(nextTuInMillis / DAY);
    if (nextTuInDays > 1) {
        nextTuIn = `${nextTuInDays} Earth days`;
    } else {
        var nextTuInHours = Math.floor(nextTuInMillis / HOUR);
        if (nextTuInHours > 1) {
            nextTuIn = `${nextTuInHours} Earth hours`;
        } else {
            var nextTuInMinutes = Math.floor(nextTuInMillis / MINUTE);
            if (nextTuInMinutes > 1) {
                nextTuIn = `${nextTuInMinutes} Earth minutes`;
            } else {
                nextTuIn = `${Math.floor(nextTuInMillis / SECOND)} Earth seconds`;
            }
        }
    }

    document.getElementById("om").textContent = om + " OM";
    document.getElementById("unt").textContent = unt + " UNT";
    document.getElementById("tu").textContent = tu + " TU";
    document.getElementById("tol_un").textContent = tol + " TOL   " + uns + " UN";
    document.getElementById("day").textContent = day;
    document.getElementById("tu_end").textContent = nextTuIn;
}, 500);

