const euro=cents=>(cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
function entry(label,delta){state.economy.history.push({label,delta});state.economy.history=state.economy.history.slice(-100)}
function renderOffers(){liveOffers()}
function offerPreview(){go('shop')}
function simulatePurchase(){go('shop')}
function cancelPlus(){go('shop')}
function secondDate(){salonComingSoon()}
function declineSecond(){document.querySelector('#modal').close()}
function acceptSecond(){salonComingSoon()}
function beginSecond(){salonComingSoon()}
function promptExtra(){return ''}
function renderAudit(){renderProjectStatus()}
function quotaPanel(){const q=Momento.limits(state);const date=Momento.limits(state).premium?new Date(state.economy.plusUntil).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'}):'';return `<aside class="quota-panel"><div><span class="date">${q.premium?'MOMENTO PREMIUM':'MOMENTO GRATUIT'} · AUJOURD’HUI</span><h3>${q.remaining} session${q.remaining>1?'s':''} restante${q.remaining>1?'s':''} sur ${q.dailyLimit}</h3><p>${state.bookings.length} / ${q.bookingLimit} réservation${q.bookingLimit>1?'s':''} en attente · Remise à zéro à minuit, heure de Paris.${q.premium?`<br>Avantages simulés jusqu’au ${date}${state.economy.renew?' · renouvellement fictif activé':' · résiliation enregistrée'}.`:''}</p></div>${q.premium?'<span class="badge">Rendez-vous partenaires · bientôt</span>':'<button class="primary" onclick="go(\'offers\')">Découvrir Premium ↗</button>'}</aside>`}
function quotaModal(kind){const q=Momento.limits(state),booking=kind==='booking';modal(`<div class="eyebrow">${booking?'VOTRE AGENDA EST REMPLI':'VOTRE QUOTA DU JOUR EST UTILISÉ'}</div><h2 style="margin-top:20px">${booking?'Une rencontre à la fois ?':'Encore envie de rencontrer ?'}</h2><p>${booking?`Votre offre permet ${q.bookingLimit} réservation${q.bookingLimit>1?'s':''} en attente. Terminez ou annulez une réservation pour libérer une place.`:`Vous avez utilisé vos ${q.dailyLimit} session${q.dailyLimit>1?'s':''} du jour. Le compteur se réinitialise à minuit, heure de Paris.`}</p>${q.premium?'<div class="notice">Vous bénéficiez déjà de Premium. Aucun achat ne contourne la limite de cette offre.</div>':'<div class="notice">Premium : accès aux salons pendant toute la période active. Prix envisagé : 9,90 €/mois. Achat fictif uniquement dans la démo.</div><button class="primary wide" onclick="document.querySelector(\'#modal\').close();go(\'offers\')">Découvrir Premium</button>'}<button class="secondary wide" style="margin-top:10px" onclick="document.querySelector('#modal').close()">${booking?'Garder mes réservations':'Revenir plus tard'}</button>`)}
function allowBooking(){if(state.bookings.length>=Momento.limits(state).bookingLimit){quotaModal('booking');return false}return true}
function consumeSessionStart(){if(!Momento.consume(state)){quotaModal('daily');return false}if(currentSessionId!==null)state.bookings=state.bookings.filter(id=>id!==currentSessionId);save();return true}
save();initAccount();
