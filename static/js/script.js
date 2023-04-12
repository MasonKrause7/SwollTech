
var localaddress = "127.0.0.1:5000";

function nameWorkout(){
    wo_name = document.getElementById('new_workout_name').value;
    window.location.href = 'createworkout.html/?wo_name='+wo_name;
}
function addExercise(exercise_name){
    window.location.href= 'createworkout.html/?existing_exercise='+exercise_name;
}
function createExercise(){
    ex_name = document.getElementById('new_exercise_name').value;
    ex_type = document.getElementById('exercise_type_input').value;
    window.location.href= 'createworkout.html/?new_exercise_name='+ex_name+'&new_exercise_type='+ex_type;
}
function removeExercise(exercise_name){
    window.location.href='/remove/?remove='+exercise_name;
}
function postWorkout(){
    window.location.href = '/postworkout.html/';
}
function viewWorkout(name){
    console.log(name)
    delim = name.indexOf(',')
    console.log('delim='+delim)
    workout_id = name.substring(0, delim)
    console.log('workout_id='+workout_id)
    workout_name = name.substring(delim+1, name.length)
    console.log('workout_name='+workout_name)
    window.location.href = '/viewworkout.html/?workout_id='+workout_id+'&workout_name='+workout_name;
}


