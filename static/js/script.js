
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
function editAccount(name){
    window.location.href = '/account.html/?action='+name;
}
function deleteAccount(user_id){
    window.location.href = '/deleteaccount/?user_id='+user_id;
}
function deleteWorkout(workout_id){
    window.location.href = '/deleteworkout/?workout_id='+workout_id;
}
function editWorkout(workout_id){
    window.location.href = '/editworkout/?workout_id='+workout_id;
}
function editWorkoutAction(workout_id, workout_name, action){
    if(action == 'changename'){
        window.location.href = '/changename/?workout_id='+workout_id+'&workout_name='+workout_name;
    }
    else if(action == 'addexercise'){
        window.location.href = '/addexercises/?workout_id='+workout_id+'&workout_name='+workout_name;
    }
    else if(action == 'removeexercise'){
        window.location.href = '/removefromworkout/?workout_id='+workout_id+'&workout_name='+workout_name;
    }
}
function postUpdatedName(workout_id){
    new_name = document.getElementById('new_workout_name');
    window.location.href = '/postworkoutname/?workout_id='+workout_id+'&new_name='+new_name;
}
function buildExerciseForWorkout(workout_id){
    new_ex_name = document.getElementById('new_exercise_name')
}
function editWorkoutAddExercise(ex_id){
    window.location.href = '/editworkout_addexistingexercise/?ex_id'+ex_id;
}

