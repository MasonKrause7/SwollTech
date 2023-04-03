
var localaddress = "http://127.0.0.1:5000";

function submitNameOfWorkout() {
    var workoutname = document.getElementById("workout_name").value;

    console.log('in submitNameOfWorkout()')
    console.log(workoutname);

}

function redirectToCreateWorkout() {
    window.location.href = 'createworkout.html'
}