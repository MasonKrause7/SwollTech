
var localaddress = "127.0.0.1:5000";

function addExercise(name){

    window.location.href= '/addexistingexercise.html/?ex_name='+name;
}
function removeExercise(name){
    window.location.href= '/removeexercise/?ex_name='+name;
}
