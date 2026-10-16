import {mountAccount} from '../account-view.mjs';
import {mountDashboard} from './dashboard.mjs';
const dispose=mountAccount(document.querySelector('#crm-surface'),{admin:true,management:mountDashboard});
window.addEventListener('pagehide',dispose,{once:true});
