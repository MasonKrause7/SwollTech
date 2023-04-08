
var localaddress = "127.0.0.1:5000";

function addExercise(name){

    window.location.href= '/addexistingexercise.html/?ex_name='+name;
}
function removeExercise(name){
    window.location.href= '/removeexercise/?ex_name='+name;
}

function quitCreatingWorkout(){
    window.location.href='/home.html/?quit=True';
}
function createWorkout(){
    woName = document.getElementById('workout_name_input').value()
    if(woName.length < 1){
        window.location.href='/createworkout.html'
    }
    else{
        window.location.href='/createworkout.html/?wo_name='+woName;
    }
}

