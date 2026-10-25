/* Explicit wishes precede any proposed person in the local 1:1 rehearsal. */
function callSetupFields(){return `<div class="call-setup-fields"><label>Je souhaite rencontrer<select id="callChoiceGender" onchange="callSetupChanged()" required><option value="">Choisir le genre recherché</option>${Object.entries(tableGenderLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><div class="table-age-fields"><label>Âge minimum<input id="callChoiceMin" type="number" min="18" max="100" value="18" onchange="callSetupChanged()"></label><label>Âge maximum<input id="callChoiceMax" type="number" min="18" max="100" value="100" onchange="callSetupChanged()"></label></div><label>Mon envie<select id="callChoiceIntent" onchange="callSetupChanged()"><option value="both">Amitié ou amour</option><option value="friendship">Faire des amis</option><option value="love">Une rencontre amoureuse</option></select></label><label>Thème de conversation<select id="callChoiceTheme" onchange="callSetupChanged()"><option value="">Toutes les envies</option>${MomentoThemes.catalog.map(t=>`<option value="${t.slug}">${t.label}</option>`).join('')}</select></label><p id="callChoiceError" role="alert"></p></div>`}
function callSetupMount(f){
 const preflight=$('#callDemoPreflight');preflight.classList.add('call-setup');preflight.querySelector('h2').textContent='Qui aimeriez-vous rencontrer ?';preflight.querySelector('p').textContent='Vos envies d’abord. Une proposition après votre validation.';
 preflight.insertAdjacentHTML('afterbegin',`<div class="call-setup-symbol" aria-hidden="true">${MomentoThemes.icon('people')}</div>`);
 preflight.querySelector('label').insertAdjacentHTML('beforebegin',callSetupFields());
 preflight.querySelector('.primary').textContent='Valider et commencer l’essai';
}
function callSetupChanged(){const f=callDemoFlow;if(!callDemoAlive(f)||f.table||f.state.phase!=='preview')return;f.choicesConfirmed=false;for(const kind of ['audio','video'])callDemoReleaseDevice(f,kind);callDemoRefresh(f)}
function callSetupConfirm(f=callDemoFlow){
 if(!callDemoAlive(f)||f.table)return !!f?.table;if(f.state.phase!=='preview')return f.choicesConfirmed===true;
 if(f.choicesConfirmed)return true;
 const gender=$('#callChoiceGender')?.value,minAge=Number($('#callChoiceMin')?.value),maxAge=Number($('#callChoiceMax')?.value),intent=$('#callChoiceIntent')?.value,theme=$('#callChoiceTheme')?.value;
 const error=$('#callChoiceError');
 if(!Object.hasOwn(tableGenderLabels,gender)||!Number.isInteger(minAge)||!Number.isInteger(maxAge)||minAge<18||maxAge>100||minAge>maxAge||!['both','love','friendship'].includes(intent)){
  if(error)error.textContent='Choisissez le genre recherché et une tranche d’âge valide entre 18 et 100 ans.';return false;
 }
 const pool=tableCompatible(gender,f.state.blocked,{minAge,maxAge,intent});
 if(!pool.length){if(error)error.textContent='Aucun profil fictif ne correspond. Modifiez vos envies pour cet essai.';return false}
 if(!MomentoConversation.configureParticipants(f.state,pool.map(p=>p.id)))return false;
 f.choices={gender,minAge,maxAge,intent,theme};f.choicesConfirmed=true;if(theme)MomentoThemes.select(theme);if(error)error.textContent='';callDemoRefresh(f);return true;
}
