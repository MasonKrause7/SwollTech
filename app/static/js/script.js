
var localaddress = "127.0.0.1:5000";


function setWorkoutToDelete(workout_id){
    console.log(`workout_id=${workout_id}`);
    const deleteWorkoutForm = document.getElementById(workout_id);
    console.log(`deleteWorkoutForm = ${deleteWorkoutForm}`);
    const url = `/deleteworkout/?workout_id=${workout_id}`;
    deleteWorkoutForm.setAttribute("action", url);
    deleteWorkoutForm.requestSubmit();
}

function nameWorkout(){
    wo_name = document.getElementById('workout_name').value;

    window.location.href = 'createworkout.html/?wo_name=' + wo_name;

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
    const action = '/deleteaccount/?user_id='+user_id;
    const form = document.getElementById('deleteAccountForm');
    form.setAttribute('action', action);
    form.requestSubmit();
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
    const new_ex_name = document.getElementById('new_exercise_name').value;
    const new_ex_type = document.getElementById('exercise_type_input').value;
    const action = '/buildexforwo/?exercise_name='+new_ex_name+"&exercise_type="+new_ex_type;
    const form = document.getElementById('addNewExerciseToExistingWorkoutForm');
    form.action = action;
    form.requestSubmit();
}
function editWorkoutAddExercise(ex_id, ex_name){
    console.log(`ex_name = ${ex_name}`);
    const action = '/editworkout_addexistingexercise/?ex_id='+ex_id;
    const form = document.getElementById(ex_name);
    form.action = action;
    form.requestSubmit();
}
function removeExerciseFromWorkout(exercise_id, workout_id){
    const action = '/removeexercisefromworkout/?ex_id='+exercise_id+"&wo_id="+workout_id;
    const form = document.getElementById(exercise_id);
    form.action = action;
    form.requestSubmit();
}
function displaySelectedWorkout(workout_id){
    window.location.href = '/displayselectedworkout/?workout_id='+workout_id;
}
function startWorkout(workout_id){
    window.location.href = '/startworkout/?workout_id='+workout_id+'&starting=True';
}
function startExercise(exercise_id){
    window.location.href = '/startexercise/?ex_id='+exercise_id;
}
function submitStrengthSet(exercise_id){
    num_reps = document.getElementById('numReps').value;
    weight_amnt = document.getElementById('amntWeight').value;
    weight_metric = document.getElementById('weightMetric').value;

    window.location.href = '/submitstrengthset/?ex_id='+exercise_id+'&num_reps='+num_reps+'&weight_amnt='+weight_amnt+'&weight_metric='+weight_metric;
}
function submitCardioSet(exercise_id){
    duration_amnt = document.getElementById().value;
    duration_metric = document.getElementById().value;
    distance_amnt = document.getElementById().value;
    distance_metric = document.getElementById().value;

    window.location.href = 'submitcardioset/?ex_id='+ex_id+'&duration_amnt='+duration_amnt+'&duration_metric='+duration_metric+'&distance_amnt='+distance_amnt+'&distance_metric='+distance_metric;
}
function backToWorkout(workout_id){
    window.location.href = '/startworkout/?workout_id='+workout_id+'&starting=False';
}
function endWorkout(){
    window.location.href = '/endworkout/';
}
function deleteSet(set_id, element_id){
    console.log(`element_id=${element_id}`);
    const action = '/deleteset/?set_id='+set_id;
    const form = document.getElementById(element_id);
    console.log(form);
    form.action = action;
    form.requestSubmit();
}

