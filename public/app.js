const state={token:'',refreshToken:'',user:null,wallets:[],categories:[],transactions:[],budgets:[],goals:[],summary:null,onboarding:null,currentView:'dashboard',categoryMode:'tree',assistantHistory:[],assistantConversationId:null,assistantConversations:[],agentSettings:null};
const $=(selector)=>document.querySelector(selector);
const $$=(selector)=>[...document.querySelectorAll(selector)];
const money=(value)=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(value||0));
const moneyCurrency=(value,currency='VND')=>new Intl.NumberFormat('vi-VN',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value||0));
const shortDate=(value)=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value));
const localDateValue=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const monthStartValue=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`;

let toastTimer;
function toast(message,error=false){const element=$('#toast');clearTimeout(toastTimer);element.textContent=message;element.className=`toast show${error?' error':''}`;toastTimer=setTimeout(()=>element.className='toast',3200)}
function apiErrorMessage(body){const details=body.error?.details;const fieldError=Object.values(details?.fieldErrors||{}).flat().find(Boolean);const formError=(details?.formErrors||[]).find(Boolean);return fieldError||formError||body.error?.message||'Không thể kết nối hệ thống.'}
let refreshRequest=null;
async function refreshSession(){
  if(!refreshRequest)refreshRequest=(async()=>{const response=await fetch('/api/v1/auth/refresh',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.refreshToken?{refreshToken:state.refreshToken}:{})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(apiErrorMessage(body));state.token=body.data.accessToken;state.refreshToken=body.data.refreshToken})().finally(()=>{refreshRequest=null});
  return refreshRequest;
}
function returnToLogin(){state.token='';state.refreshToken='';state.user=null;$('#app').classList.add('hidden');$('#login-screen').classList.remove('hidden')}
async function api(path,options={}){const{skipRefresh=false,...fetchOptions}=options;const requestToken=state.token;const response=await fetch(`/api/v1${path}`,{cache:'no-store',credentials:'same-origin',...fetchOptions,headers:{'Content-Type':'application/json','Cache-Control':'no-cache',...(requestToken?{Authorization:`Bearer ${requestToken}`}:{}) ,...(fetchOptions.headers||{})}});const body=await response.json().catch(()=>({}));if(response.status===401&&!skipRefresh&&path!=='/auth/refresh'&&path!=='/auth/session'){try{if(state.token===requestToken)await refreshSession();return api(path,{...fetchOptions,skipRefresh:true})}catch{returnToLogin();throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')}}if(!response.ok){const error=new Error(apiErrorMessage(body));error.code=body.error?.code;error.details=body.error?.details;throw error}return body.data}

async function enterApp(data){state.token=data.accessToken;state.refreshToken=data.refreshToken;state.user=data.user;await loadData();$('#login-screen').classList.add('hidden');$('#app').classList.remove('hidden');render();const initialView=location.hash.replace('#','');const validView=document.getElementById(`view-${initialView}`)?initialView:'dashboard';showView(validView,{replace:true,fromHistory:validView===initialView});return maybeShowOnboarding()}
$('#login-form').addEventListener('submit',async(event)=>{event.preventDefault();const button=event.submitter;button.disabled=true;button.firstElementChild.textContent='Đang mở sổ...';try{const data=await api('/auth/login',{method:'POST',body:JSON.stringify({identifier:$('#identifier').value,password:$('#password').value,remember:$('#remember-login').checked,deviceName:navigator.userAgent.slice(0,120)}),skipRefresh:true});if(!(await enterApp(data)))toast('Đăng nhập thành công. Chào mừng bạn!')}catch(error){toast(error.message,true)}finally{button.disabled=false;button.firstElementChild.textContent='Vào sổ của tôi'}});

async function loadData(){const reportParams=new URLSearchParams({from:monthStartValue(),to:localDateValue()});const [wallets,categories,transactions,budgets,goals,summary,onboarding]=await Promise.all([api('/wallets?includeArchived=true'),api('/categories?tree=false'),api('/transactions?limit=100'),api('/budgets'),api('/goals'),api(`/reports/summary?${reportParams}`),api('/profile/onboarding')]);Object.assign(state,{wallets,categories,transactions:transactions,budgets,goals,summary,onboarding})}

function render(){const name=state.user.fullName||state.user.username;const userName=$('#user-name');if(userName)userName.textContent=name.split(' ').slice(-1)[0];const vip=Boolean(state.user.isVip);$('#open-profile').textContent=name[0].toUpperCase();$('#open-profile').classList.toggle('vip',vip);$('#vip-badge').classList.toggle('hidden',!vip);$('#today').textContent=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'2-digit',month:'long'}).format(new Date()).toUpperCase();const baseCurrency=state.user.currency||'VND';const total=state.wallets.filter(wallet=>!wallet.archivedAt&&wallet.currency===baseCurrency).reduce((sum,wallet)=>sum+Number(wallet.balance),0);$('#total-balance').textContent=moneyCurrency(total,baseCurrency);$('#income').textContent=moneyCurrency(state.summary.income,baseCurrency);$('#expense').textContent=moneyCurrency(state.summary.expense,baseCurrency);$('#net').textContent=moneyCurrency(state.summary.net,baseCurrency);renderTransactions();renderWallets();renderCategories();renderSpending();renderBudgets();renderGoals();fillForm()}

function transactionHtml(item,actions=false){const expense=item.type==='EXPENSE';const transfer=item.type==='TRANSFER';const title=item.note||item.category?.name||(transfer?'Chuyển khoản':'Giao dịch');const subtitle=`${item.wallet.name}${item.destinationWallet?' → '+item.destinationWallet.name:''}${item.category?' · '+item.category.name:''} · ${shortDate(item.occurredAt)}`;return `<article class="transaction-row${actions?' has-actions':''}"><div class="transaction-icon ${expense?'expense':''}">${expense?'↗':transfer?'↔':'↙'}</div><div class="transaction-info"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div><div class="transaction-amount ${expense?'expense':''}">${expense?'−':transfer?'':'＋'} ${moneyCurrency(item.amount,item.wallet.currency||state.user.currency)}</div>${actions?`<div class="transaction-actions"><button data-transaction-action="edit" data-id="${item.id}">Sửa</button><button class="danger" data-transaction-action="delete" data-id="${item.id}">Xóa</button></div>`:''}</article>`}
function renderTransactions(){const empty='<div class="empty"><span>Chưa có giao dịch phù hợp.</span><button class="empty-action" type="button" data-empty-action="transaction">Ghi giao dịch đầu tiên</button></div>';$('#recent-transactions').innerHTML=state.transactions.slice(0,5).map(item=>transactionHtml(item)).join('')||empty;$('#all-transactions').innerHTML=state.transactions.map(item=>transactionHtml(item,true)).join('')||empty;const walletValue=$('#transaction-wallet-filter').value;$('#transaction-wallet-filter').innerHTML='<option value="">Tất cả ví</option>'+state.wallets.map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');$('#transaction-wallet-filter').value=walletValue;const categoryValue=$('#transaction-category-filter').value;$('#transaction-category-filter').innerHTML='<option value="">Tất cả danh mục</option>'+state.categories.map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');$('#transaction-category-filter').value=categoryValue}
function walletHtml(wallet,actions=false){const icons={CASH:'₫',BANK:'▣',E_WALLET:'◈',CREDIT:'◇',OTHER:'□'};const typeLabels={CASH:'Tiền mặt',BANK:'Ngân hàng',E_WALLET:'Ví điện tử',CREDIT:'Thẻ tín dụng',OTHER:'Khác'};return `<article class="wallet-card ${wallet.archivedAt?'archived':''}"><div class="wallet-type">${icons[wallet.type]||'□'}</div><span>${typeLabels[wallet.type]||wallet.type}${wallet.archivedAt?' · Đã lưu trữ':''}</span><h3>${escapeHtml(wallet.name)}</h3><strong>${moneyCurrency(wallet.balance,wallet.currency)}</strong>${actions?`<div class="wallet-actions"><button data-wallet-action="detail" data-id="${wallet.id}">Chi tiết</button><button data-wallet-action="edit" data-id="${wallet.id}">Sửa</button><button class="${wallet.archivedAt?'':'danger'}" data-wallet-action="${wallet.archivedAt?'restore':'archive'}" data-id="${wallet.id}">${wallet.archivedAt?'Khôi phục':'Lưu trữ'}</button></div>`:''}</article>`}
function renderWallets(){const empty='<div class="empty"><span>Chưa có ví để quản lý.</span><button class="empty-action" type="button" data-empty-action="wallet">Tạo ví đầu tiên</button></div>';const active=state.wallets.filter(wallet=>!wallet.archivedAt);$('#wallet-preview').innerHTML=active.map(wallet=>walletHtml(wallet)).join('')||empty;const showArchived=$('#show-archived-wallets').checked;const visible=state.wallets.filter(wallet=>showArchived||!wallet.archivedAt);$('#all-wallets').innerHTML=visible.map(wallet=>walletHtml(wallet,true)).join('')||`<div class="panel">${empty}</div>`}
function categoryItemHtml(item,level=0){const parent=state.categories.find(category=>category.id===item.parentId);return `<article class="category-item ${level?'child':''}" style="${level?`margin-left:${Math.min(level,4)*25}px`:''}"><div class="category-main"><span class="category-color" style="background:${item.color||'#23654f'}"></span><span class="category-icon">${escapeHtml(item.icon|| (item.type==='INCOME'?'↙':'↗'))}</span><div class="category-info"><strong>${escapeHtml(item.name)}</strong><small>${parent?`Thuộc ${escapeHtml(parent.name)}`:'Danh mục gốc'}</small></div><div class="category-actions"><button data-category-action="edit" data-id="${item.id}">Sửa</button><button class="danger" data-category-action="delete" data-id="${item.id}">Xóa</button></div></div></article>`}
function orderedCategories(type){const items=state.categories.filter(item=>item.type===type);if(state.categoryMode==='flat')return items.sort((a,b)=>a.name.localeCompare(b.name,'vi')).map(item=>({item,level:0}));const children=new Map();for(const item of items){const key=item.parentId||'root';children.set(key,[...(children.get(key)||[]),item])}const output=[];function visit(parentId,level){for(const item of (children.get(parentId)||[]).sort((a,b)=>a.name.localeCompare(b.name,'vi'))){output.push({item,level});visit(item.id,level+1)}}visit('root',0);for(const item of items)if(!output.some(entry=>entry.item.id===item.id))output.push({item,level:0});return output}
function renderCategories(){const income=orderedCategories('INCOME');const expense=orderedCategories('EXPENSE');$('#income-category-count').textContent=income.length;$('#expense-category-count').textContent=expense.length;$('#income-categories').innerHTML=income.map(({item,level})=>categoryItemHtml(item,level)).join('')||'<div class="empty">Chưa có danh mục thu.</div>';$('#expense-categories').innerHTML=expense.map(({item,level})=>categoryItemHtml(item,level)).join('')||'<div class="empty">Chưa có danh mục chi.</div>';$$('[data-category-mode]').forEach(button=>button.classList.toggle('active',button.dataset.categoryMode===state.categoryMode))}
function renderSpending(){const items=state.summary.expenseByCategory||[];const max=Math.max(...items.map(item=>item.amount),1);$('#spending-categories').innerHTML=items.slice(0,5).map(item=>`<div class="spending-item"><div class="spending-top"><span>${escapeHtml(item.categoryName)}</span><b>${moneyCurrency(item.amount,item.currency||state.user.currency)}</b></div><div class="progress"><span style="width:${Math.max(5,item.amount/max*100)}%"></span></div></div>`).join('')||'<div class="empty">Chưa có dữ liệu chi tiêu.</div>'}
function renderBudgets(){$('#budget-list').innerHTML=state.budgets.map(item=>`<article class="plan-card"><span class="eyebrow">${item.category?.name||'TOÀN BỘ CHI TIÊU'}</span><h3>${escapeHtml(item.name)}</h3><p>${shortDate(item.startDate)} — ${shortDate(item.endDate)}</p><div class="plan-numbers"><span>Đã dùng <b>${moneyCurrency(item.spent,item.currency||state.user.currency)}</b></span><span>${Math.round(item.percentUsed)}%</span></div><div class="progress"><span style="width:${Math.min(100,item.percentUsed)}%"></span></div><small>Còn lại ${moneyCurrency(item.remaining,item.currency||state.user.currency)}</small><div class="plan-actions"><button data-budget-action="edit" data-id="${item.id}">Sửa</button><button class="danger" data-budget-action="delete" data-id="${item.id}">Xóa</button></div></article>`).join('')||'<div class="panel empty"><span>Chưa thiết lập ngân sách.</span><button class="empty-action" type="button" data-empty-action="budget">Tạo ngân sách</button></div>'}
function renderGoals(){$('#goal-list').innerHTML=state.goals.map(item=>{const currency=item.wallet?.currency||state.user.currency||'VND';return `<article class="plan-card"><span class="eyebrow">${item.status==='COMPLETED'?'ĐÃ HOÀN THÀNH':item.status==='CANCELLED'?'ĐÃ HỦY':'ĐANG THỰC HIỆN'}</span><h3>${escapeHtml(item.name)}</h3><p>${item.targetDate?'Hạn '+shortDate(item.targetDate):'Không giới hạn thời gian'} · ${item.wallet?'Giữ ở ví '+escapeHtml(item.wallet.name):'Chưa liên kết ví'}</p><div class="plan-numbers"><span>Đã có <b>${moneyCurrency(item.currentAmount,currency)}</b></span><span>${Math.round(item.percentCompleted)}%</span></div><div class="progress"><span style="width:${Math.min(100,item.percentCompleted)}%"></span></div><small>Đích đến ${moneyCurrency(item.targetAmount,currency)}</small><div class="plan-actions"><button data-goal-action="contribute" data-id="${item.id}">Góp tiền</button><button data-goal-action="edit" data-id="${item.id}">Sửa</button><button class="danger" data-goal-action="delete" data-id="${item.id}">Xóa</button></div></article>`}).join('')||'<div class="panel empty"><span>Chưa có mục tiêu tài chính.</span><button class="empty-action" type="button" data-empty-action="goal">Tạo mục tiêu</button></div>'}
function fillForm(){const type=document.querySelector('input[name="type"]:checked').value;const activeWallets=state.wallets.filter(item=>!item.archivedAt);const sourceValue=$('#tx-wallet').value;const destinationValue=$('#tx-destination').value;const categoryValue=$('#tx-category').value;$('#tx-wallet').innerHTML=activeWallets.map(item=>`<option value="${item.id}">${escapeHtml(item.name)} · ${item.currency}</option>`).join('');if(activeWallets.some(item=>item.id===sourceValue))$('#tx-wallet').value=sourceValue;const source=activeWallets.find(item=>item.id===$('#tx-wallet').value);const destinations=activeWallets.filter(item=>item.id!==source?.id&&item.currency===source?.currency);$('#tx-destination').innerHTML=destinations.length?destinations.map(item=>`<option value="${item.id}">${escapeHtml(item.name)} · ${item.currency}</option>`).join(''):'<option value="">Không có ví đích phù hợp</option>';if(destinations.some(item=>item.id===destinationValue))$('#tx-destination').value=destinationValue;const categories=state.categories.filter(item=>item.type===type);$('#tx-category').innerHTML='<option value="">Chưa phân loại</option>'+categories.map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');if(categories.some(item=>item.id===categoryValue))$('#tx-category').value=categoryValue;$('#tx-category').closest('label').classList.toggle('hidden',type==='TRANSFER');$('#tx-destination-group').classList.toggle('hidden',type!=='TRANSFER');$('#tx-destination').required=type==='TRANSFER';if(!$('#tx-date').value)$('#tx-date').value=localDateValue()}

function setSidebar(open){$('.sidebar').classList.toggle('open',open);$('#sidebar-backdrop').classList.toggle('show',open);$('#menu-btn').setAttribute('aria-expanded',String(open));$('#menu-btn').setAttribute('aria-label',open?'Đóng menu':'Mở menu');document.body.classList.toggle('sidebar-open',open)}
function showView(view){$$('.view').forEach(item=>item.classList.toggle('active',item.id===`view-${view}`));$$('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.view===view));const labels={dashboard:'Tổng quan tài chính',transactions:'Giao dịch',wallets:'Ví của tôi',categories:'Danh mục thu chi',budgets:'Ngân sách',goals:'Mục tiêu',reports:'Báo cáo và đối soát',planning:'Tự động hóa tài chính',insights:'Trợ lý thông minh'};$('#page-title').innerHTML=view==='dashboard'?`Chào buổi sáng, <span id="user-name">${(state.user.fullName||state.user.username).split(' ').slice(-1)[0]}</span>`:labels[view];setSidebar(false);if(view==='reports')void loadReports();if(view==='planning')void loadPlanning();if(view==='insights')void loadInsights()}
$$('.nav-item').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));$$('[data-view-target]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.viewTarget)));$('#menu-btn').addEventListener('click',()=>setSidebar(!$('.sidebar').classList.contains('open')));$('#sidebar-backdrop').addEventListener('click',()=>setSidebar(false));$('#sidebar-close').addEventListener('click',()=>setSidebar(false));
function renderReceiptList(transaction){$('#tx-receipts-list').innerHTML=(transaction?.receipts||[]).map(receipt=>`<div class="receipt-item"><span>${escapeHtml(receipt.originalName)}</span><div><button type="button" data-receipt-action="download" data-transaction-id="${transaction.id}" data-receipt-id="${receipt.id}" data-name="${escapeHtml(receipt.originalName)}">Tải</button><button type="button" class="danger" data-receipt-action="delete" data-transaction-id="${transaction.id}" data-receipt-id="${receipt.id}">Xóa</button></div></div>`).join('')}
function openModal(transaction=null){$('#transaction-form').reset();$('#tx-receipt-name').textContent='Chưa chọn tệp';$('#tx-id').value=transaction?.id||'';$('#transaction-modal-title').textContent=transaction?'Chỉnh sửa giao dịch':'Giao dịch mới';const type=transaction?.type||'EXPENSE';document.querySelector(`input[name="type"][value="${type}"]`).checked=true;if(transaction)$('#tx-wallet').value=transaction.walletId;fillForm();renderReceiptList(transaction);if(transaction){$('#tx-amount').value=Number(transaction.amount);$('#tx-wallet').value=transaction.walletId;fillForm();$('#tx-destination').value=transaction.destinationWalletId||'';$('#tx-category').value=transaction.categoryId||'';$('#tx-payee').value=transaction.payee||'';$('#tx-status').value=transaction.status||'CLEARED';$('#tx-payment-method').value=transaction.paymentMethod||'';$('#tx-reference').value=transaction.reference||'';$('#tx-location').value=transaction.location||'';$('#tx-note').value=transaction.note||'';$('#tx-date').value=localDateValue(new Date(transaction.occurredAt))}openNamedModal('transaction-modal','#tx-amount')}function closeModal(){closeNamedModal('transaction-modal')}$('#open-transaction').addEventListener('click',()=>openModal());$('#close-modal').addEventListener('click',closeModal);$('#transaction-modal').addEventListener('click',event=>{if(event.target===event.currentTarget)closeModal()});$$('input[name="type"]').forEach(input=>input.addEventListener('change',fillForm));$('#tx-wallet').addEventListener('change',fillForm);$('#tx-receipt').addEventListener('change',event=>{$('#tx-receipt-name').textContent=event.target.files[0]?.name||'Chưa chọn tệp'});
async function uploadReceipt(transactionId,file){const form=new FormData();form.append('file',file);const response=await fetch(`/api/v1/transactions/${transactionId}/receipts`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`},body:form});const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Không thể tải hóa đơn.')}
$('#transaction-form').addEventListener('submit',async(event)=>{event.preventDefault();const id=$('#tx-id').value;const type=document.querySelector('input[name="type"]:checked').value;const walletId=$('#tx-wallet').value;const destinationWalletId=type==='TRANSFER'?$('#tx-destination').value:null;if(!walletId){toast('Bạn cần tạo hoặc chọn ví nguồn.',true);return}if(type==='TRANSFER'&&!destinationWalletId){toast('Cần có một ví đích khác, cùng loại tiền tệ.',true);return}const body={type,amount:Number($('#tx-amount').value),walletId,destinationWalletId,categoryId:type==='TRANSFER'?null:($('#tx-category').value||null),payee:$('#tx-payee').value||null,status:$('#tx-status').value,paymentMethod:$('#tx-payment-method').value||null,reference:$('#tx-reference').value||null,location:$('#tx-location').value||null,note:$('#tx-note').value||null,occurredAt:new Date(`${$('#tx-date').value}T12:00:00`).toISOString()};try{const button=event.submitter;button.disabled=true;const transaction=await api(id?`/transactions/${id}`:'/transactions',{method:id?'PATCH':'POST',body:JSON.stringify(body)});const file=$('#tx-receipt').files[0];if(file)await uploadReceipt(transaction.id,file);event.target.reset();closeModal();await loadData();render();toast(id?'Đã cập nhật giao dịch.':'Đã lưu giao dịch mới.')}catch(error){toast(error.message,true)}finally{if(event.submitter)event.submitter.disabled=false}});
$('#tx-receipts-list').addEventListener('click',async event=>{const button=event.target.closest('[data-receipt-action]');if(!button)return;const path=`/api/v1/transactions/${button.dataset.transactionId}/receipts/${button.dataset.receiptId}`;try{if(button.dataset.receiptAction==='download'){const response=await fetch(path,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok)throw new Error('Không thể tải hóa đơn.');const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=button.dataset.name||'receipt';link.click();URL.revokeObjectURL(url);return}if(!confirm('Xóa hóa đơn này?'))return;await api(`/transactions/${button.dataset.transactionId}/receipts/${button.dataset.receiptId}`,{method:'DELETE'});const transaction=state.transactions.find(item=>item.id===button.dataset.transactionId);if(transaction)transaction.receipts=transaction.receipts.filter(item=>item.id!==button.dataset.receiptId);renderReceiptList(transaction);toast('Đã xóa hóa đơn.')}catch(error){toast(error.message,true)}});
$('#all-transactions').addEventListener('click',async event=>{const button=event.target.closest('[data-transaction-action]');if(!button)return;const transaction=state.transactions.find(item=>item.id===button.dataset.id);if(!transaction)return;if(button.dataset.transactionAction==='edit'){openModal(transaction);return}if(!confirm(`Xóa giao dịch “${transaction.note||money(transaction.amount)}”?`))return;try{await api(`/transactions/${transaction.id}`,{method:'DELETE'});await loadData();render();toast('Đã xóa giao dịch.')}catch(error){toast(error.message,true)}});
function transactionFilterParams(includeLimit=true){const params=new URLSearchParams();if(includeLimit)params.set('limit','100');if($('#transaction-type-filter').value)params.set('type',$('#transaction-type-filter').value);if($('#transaction-wallet-filter').value)params.set('walletId',$('#transaction-wallet-filter').value);if($('#transaction-category-filter').value)params.set('categoryId',$('#transaction-category-filter').value);if($('#transaction-from-filter').value)params.set('from',$('#transaction-from-filter').value);if($('#transaction-to-filter').value)params.set('to',$('#transaction-to-filter').value);if($('#transaction-keyword-filter').value.trim())params.set('keyword',$('#transaction-keyword-filter').value.trim());return params}
async function applyTransactionFilters(){try{state.transactions=await api(`/transactions?${transactionFilterParams()}`);renderTransactions()}catch(error){toast(error.message,true)}}
$('#apply-transaction-filter').addEventListener('click',applyTransactionFilters);$('#transaction-keyword-filter').addEventListener('keydown',event=>{if(event.key==='Enter')void applyTransactionFilters()});
$('#reset-transaction-filter').addEventListener('click',async()=>{$$('#transaction-type-filter,#transaction-wallet-filter,#transaction-category-filter,#transaction-from-filter,#transaction-to-filter,#transaction-keyword-filter').forEach(input=>input.value='');await applyTransactionFilters()});
$('#export-csv').addEventListener('click',async event=>{event.preventDefault();try{const response=await fetch(`/api/v1/transactions/export.csv?${transactionFilterParams(false)}`,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok)throw new Error('Không thể xuất CSV.');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='transactions.csv';link.click();URL.revokeObjectURL(url)}catch(error){toast(error.message,true)}});

let lastFocusedElement=null;
function openNamedModal(id,focusSelector='input:not([type="hidden"]),select,button'){lastFocusedElement=document.activeElement;const modal=$(`#${id}`);modal.classList.remove('hidden');document.body.classList.add('modal-open');requestAnimationFrame(()=>modal.querySelector(focusSelector)?.focus())}
function closeNamedModal(id){$(`#${id}`).classList.add('hidden');document.body.classList.toggle('modal-open',Boolean($('.modal:not(.hidden)')));if(lastFocusedElement?.isConnected)lastFocusedElement.focus()}
$$('[data-close-modal]').forEach(button=>button.addEventListener('click',()=>closeNamedModal(button.dataset.closeModal)));
['wallet-modal','wallet-detail-modal','category-modal','budget-modal','goal-modal','contribution-modal','profile-modal','forgot-password-modal','register-modal','reset-password-modal'].forEach(id=>$(`#${id}`).addEventListener('click',event=>{if(event.target===event.currentTarget)closeNamedModal(id)}));
document.addEventListener('keydown',event=>{const modal=$('.modal:not(.hidden)');if(event.key==='Escape'){if(modal){closeNamedModal(modal.id);return}if($('.sidebar.open'))setSidebar(false)}if(event.key!=='Tab'||!modal)return;const focusable=[...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(item=>item.offsetParent!==null);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
document.addEventListener('click',event=>{const action=event.target.closest('[data-empty-action]')?.dataset.emptyAction;if(action==='transaction')openModal();if(action==='wallet')openWalletForm();if(action==='budget')openBudgetForm();if(action==='goal')openGoalForm()});

function openWalletForm(wallet=null){$('#wallet-form').reset();$('#wallet-id').value=wallet?.id||'';$('#wallet-modal-title').textContent=wallet?'Chỉnh sửa ví':'Thêm ví mới';$('#wallet-name').value=wallet?.name||'';$('#wallet-type').value=wallet?.type||'CASH';$('#wallet-currency').value=wallet?.currency||'VND';$('#wallet-opening-balance').value=Number(wallet?.openingBalance||0);$('#wallet-institution').value=wallet?.institutionName||'';$('#wallet-color').value=wallet?.color||'#23654f';$('#wallet-credit-limit').value=wallet?.creditLimit?Number(wallet.creditLimit):'';$('#wallet-billing-day').value=wallet?.billingDay||'';$('#wallet-due-day').value=wallet?.dueDay||'';openNamedModal('wallet-modal');$('#wallet-name').focus()}
$('#open-wallet').addEventListener('click',()=>openWalletForm());
$('#show-archived-wallets').addEventListener('change',renderWallets);
$('#wallet-form').addEventListener('submit',async event=>{event.preventDefault();const id=$('#wallet-id').value;const numberOrNull=(selector)=>$(selector).value?Number($(selector).value):null;const body={name:$('#wallet-name').value,type:$('#wallet-type').value,currency:$('#wallet-currency').value.toUpperCase(),openingBalance:Number($('#wallet-opening-balance').value),institutionName:$('#wallet-institution').value||null,color:$('#wallet-color').value,creditLimit:numberOrNull('#wallet-credit-limit'),billingDay:numberOrNull('#wallet-billing-day'),dueDay:numberOrNull('#wallet-due-day')};try{await api(id?`/wallets/${id}`:'/wallets',{method:id?'PATCH':'POST',body:JSON.stringify(body)});closeNamedModal('wallet-modal');await loadData();render();toast(id?'Đã cập nhật ví.':'Đã tạo ví mới.')}catch(error){toast(error.message,true)}});
$('#all-wallets').addEventListener('click',async event=>{const button=event.target.closest('[data-wallet-action]');if(!button)return;const wallet=state.wallets.find(item=>item.id===button.dataset.id);if(!wallet)return;const action=button.dataset.walletAction;if(action==='edit'){openWalletForm(wallet);return}if(action==='detail'){try{const detail=await api(`/wallets/${wallet.id}`);const typeLabels={CASH:'Tiền mặt',BANK:'Ngân hàng',E_WALLET:'Ví điện tử',CREDIT:'Thẻ tín dụng',OTHER:'Khác'};$('#wallet-detail').innerHTML=`<h2>${escapeHtml(detail.name)}</h2><div class="wallet-detail-balance"><span>SỐ DƯ HIỆN TẠI</span><strong>${moneyCurrency(detail.balance,detail.currency)}</strong></div><div class="detail-grid"><div><span>Loại ví</span><b>${typeLabels[detail.type]||detail.type}</b></div><div><span>Tiền tệ</span><b>${detail.currency}</b></div><div><span>Số dư ban đầu</span><b>${moneyCurrency(detail.openingBalance,detail.currency)}</b></div><div><span>Trạng thái</span><b>${detail.archivedAt?'Đã lưu trữ':'Đang hoạt động'}</b></div><div><span>Ngày tạo</span><b>${shortDate(detail.createdAt)}</b></div><div><span>Cập nhật</span><b>${shortDate(detail.updatedAt)}</b></div></div>`;openNamedModal('wallet-detail-modal')}catch(error){toast(error.message,true)}return}if(action==='archive'&&!confirm(`Lưu trữ ví “${wallet.name}”? Lịch sử giao dịch vẫn được giữ lại.`))return;try{await api(`/wallets/${wallet.id}${action==='restore'?'/restore':''}`,{method:action==='restore'?'POST':'DELETE'});await loadData();render();toast(action==='restore'?'Đã khôi phục ví.':'Đã lưu trữ ví.')}catch(error){toast(error.message,true)}});

function fillCategoryParents(type,currentId='',selected=''){const candidates=state.categories.filter(item=>item.type===type&&item.id!==currentId);$('#category-parent').innerHTML='<option value="">Không có</option>'+candidates.map(item=>`<option value="${item.id}" ${item.id===selected?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}
function openCategoryForm(category=null){$('#category-form').reset();$('#category-id').value=category?.id||'';$('#category-modal-title').textContent=category?'Chỉnh sửa danh mục':'Thêm danh mục';$('#category-name').value=category?.name||'';$('#category-type').value=category?.type||'EXPENSE';$('#category-icon').value=category?.icon||'';$('#category-color').value=category?.color||'#23654f';fillCategoryParents($('#category-type').value,category?.id||'',category?.parentId||'');openNamedModal('category-modal');$('#category-name').focus()}
$('#open-category').addEventListener('click',()=>openCategoryForm());
$('#category-type').addEventListener('change',()=>fillCategoryParents($('#category-type').value,$('#category-id').value,''));
$$('[data-category-mode]').forEach(button=>button.addEventListener('click',()=>{state.categoryMode=button.dataset.categoryMode;renderCategories()}));
$('#category-form').addEventListener('submit',async event=>{event.preventDefault();const id=$('#category-id').value;const body={name:$('#category-name').value,type:$('#category-type').value,parentId:$('#category-parent').value||null,icon:$('#category-icon').value||null,color:$('#category-color').value||null};try{await api(id?`/categories/${id}`:'/categories',{method:id?'PATCH':'POST',body:JSON.stringify(body)});closeNamedModal('category-modal');await loadData();render();toast(id?'Đã cập nhật danh mục.':'Đã tạo danh mục mới.')}catch(error){toast(error.message,true)}});
$('.category-columns').addEventListener('click',async event=>{const button=event.target.closest('[data-category-action]');if(!button)return;const category=state.categories.find(item=>item.id===button.dataset.id);if(!category)return;if(button.dataset.categoryAction==='edit'){openCategoryForm(category);return}if(!confirm(`Xóa danh mục “${category.name}”?`))return;try{await api(`/categories/${category.id}`,{method:'DELETE'});await loadData();render();toast('Đã xóa danh mục.')}catch(error){toast(error.message,true)}});

function openBudgetForm(budget=null){$('#budget-form').reset();$('#budget-id').value=budget?.id||'';$('#budget-modal-title').textContent=budget?'Chỉnh sửa ngân sách':'Thêm ngân sách';$('#budget-name').value=budget?.name||'';$('#budget-amount').value=budget?Number(budget.amount):'';$('#budget-category').innerHTML='<option value="">Toàn bộ chi tiêu</option>'+state.categories.filter(item=>item.type==='EXPENSE').map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');$('#budget-category').value=budget?.categoryId||'';const today=new Date();const monthEnd=new Date(today.getFullYear(),today.getMonth()+1,0);$('#budget-start').value=budget?new Date(budget.startDate).toISOString().slice(0,10):today.toISOString().slice(0,10);$('#budget-end').value=budget?new Date(budget.endDate).toISOString().slice(0,10):monthEnd.toISOString().slice(0,10);$('#budget-recurrence').value=budget?.recurrence||'';$('#budget-rollover').checked=Boolean(budget?.rollover);openNamedModal('budget-modal')}
$('#open-budget').addEventListener('click',()=>openBudgetForm());
$('#budget-form').addEventListener('submit',async event=>{event.preventDefault();const id=$('#budget-id').value;const body={name:$('#budget-name').value,amount:Number($('#budget-amount').value),categoryId:$('#budget-category').value||null,startDate:$('#budget-start').value,endDate:$('#budget-end').value,recurrence:$('#budget-recurrence').value||null,rollover:$('#budget-rollover').checked};try{await api(id?`/budgets/${id}`:'/budgets',{method:id?'PATCH':'POST',body:JSON.stringify(body)});closeNamedModal('budget-modal');await loadData();render();toast(id?'Đã cập nhật ngân sách.':'Đã tạo ngân sách.')}catch(error){toast(error.message,true)}});
$('#budget-list').addEventListener('click',async event=>{const button=event.target.closest('[data-budget-action]');if(!button)return;const budget=state.budgets.find(item=>item.id===button.dataset.id);if(!budget)return;if(button.dataset.budgetAction==='edit'){openBudgetForm(budget);return}if(!confirm(`Xóa ngân sách “${budget.name}”?`))return;try{await api(`/budgets/${budget.id}`,{method:'DELETE'});await loadData();render();toast('Đã xóa ngân sách.')}catch(error){toast(error.message,true)}});

function openGoalForm(goal=null){$('#goal-form').reset();$('#goal-id').value=goal?.id||'';$('#goal-modal-title').textContent=goal?'Chỉnh sửa mục tiêu':'Thêm mục tiêu';$('#goal-name').value=goal?.name||'';$('#goal-target').value=goal?Number(goal.targetAmount):'';$('#goal-wallet').innerHTML='<option value="">Không liên kết</option>'+state.wallets.filter(item=>!item.archivedAt).map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');$('#goal-wallet').value=goal?.walletId||'';$('#goal-date').value=goal?.targetDate?new Date(goal.targetDate).toISOString().slice(0,10):'';$('#goal-recurring-amount').value=goal?.recurringAmount?Number(goal.recurringAmount):'';$('#goal-recurring-frequency').value=goal?.recurringFrequency||'';$('#goal-priority').value=goal?.priority||0;openNamedModal('goal-modal')}
$('#open-goal').addEventListener('click',()=>openGoalForm());
$('#goal-form').addEventListener('submit',async event=>{event.preventDefault();const id=$('#goal-id').value;const body={name:$('#goal-name').value,targetAmount:Number($('#goal-target').value),walletId:$('#goal-wallet').value||null,targetDate:$('#goal-date').value||null,recurringAmount:$('#goal-recurring-amount').value?Number($('#goal-recurring-amount').value):null,recurringFrequency:$('#goal-recurring-frequency').value||null,priority:Number($('#goal-priority').value||0)};try{await api(id?`/goals/${id}`:'/goals',{method:id?'PATCH':'POST',body:JSON.stringify(body)});closeNamedModal('goal-modal');await loadData();render();toast(id?'Đã cập nhật mục tiêu.':'Đã tạo mục tiêu.')}catch(error){toast(error.message,true)}});
$('#goal-list').addEventListener('click',async event=>{const button=event.target.closest('[data-goal-action]');if(!button)return;const goal=state.goals.find(item=>item.id===button.dataset.id);if(!goal)return;const action=button.dataset.goalAction;if(action==='edit'){openGoalForm(goal);return}if(action==='contribute'){$('#contribution-form').reset();$('#contribution-goal-id').value=goal.id;$('#contribution-title').textContent=goal.name;openNamedModal('contribution-modal');return}if(!confirm(`Xóa mục tiêu “${goal.name}”?`))return;try{await api(`/goals/${goal.id}`,{method:'DELETE'});await loadData();render();toast('Đã xóa mục tiêu.')}catch(error){toast(error.message,true)}});
$('#contribution-form').addEventListener('submit',async event=>{event.preventDefault();const id=$('#contribution-goal-id').value;try{await api(`/goals/${id}/contributions`,{method:'POST',body:JSON.stringify({amount:Number($('#contribution-amount').value),note:$('#contribution-note').value||undefined,fromWalletId:$('#contribution-wallet').value||undefined})});closeNamedModal('contribution-modal');await loadData();render();toast($('#contribution-wallet').value?'Đã chuyển tiền vào mục tiêu.':'Đã cập nhật tiến độ mục tiêu.')}catch(error){toast(error.message,true)}});

async function loadReports(){try{const params=new URLSearchParams();if($('#report-from').value)params.set('from',$('#report-from').value);if($('#report-to').value)params.set('to',$('#report-to').value);const [summary,reconciliation]=await Promise.all([api(`/reports/summary?${params}`),api('/reports/reconciliation')]);const currencies=summary.byCurrency?.length?summary.byCurrency:[{currency:summary.currency||'VND',income:summary.income,expense:summary.expense,net:summary.net}];const multi=currencies.length>1;$('#report-currencies').innerHTML=currencies.map(item=>{const suffix=multi?` (${item.currency})`:'';return `<article class="metric-card income"><div class="metric-icon">↙</div><div><span>Thu vào${suffix}</span><strong>${moneyCurrency(item.income,item.currency)}</strong><small>Trong kỳ đã chọn</small></div></article><article class="metric-card expense"><div class="metric-icon">↗</div><div><span>Chi ra${suffix}</span><strong>${moneyCurrency(item.expense,item.currency)}</strong><small>Trong kỳ đã chọn</small></div></article><article class="metric-card net"><div class="metric-icon">≈</div><div><span>Còn lại${suffix}</span><strong>${moneyCurrency(item.net,item.currency)}</strong><small>${Number(item.net)<0?'Chi nhiều hơn thu':'Thu trừ chi'}</small></div></article>`}).join('');$('#reconciliation-list').innerHTML='<div class="reconciliation-row header"><span>Ví</span><span>Tiền tệ</span><span>Số dư đầu kỳ</span><b>Số dư hiện tại</b></div>'+reconciliation.wallets.map(item=>`<div class="reconciliation-row"><span data-label="Ví">${escapeHtml(item.walletName)}${item.archived?' (đã lưu trữ)':''}</span><span data-label="Tiền tệ">${item.currency}</span><span data-label="Số dư đầu kỳ">${moneyCurrency(item.openingBalance,item.currency)}</span><b data-label="Số dư hiện tại">${moneyCurrency(item.calculatedBalance,item.currency)}</b></div>`).join('')}catch(error){toast(error.message,true)}}


async function loadPlanning(){
  try{
    const[recurring,bills,tags,households]=await Promise.all([api('/productivity/recurring'),api('/productivity/bills'),api('/productivity/tags'),api('/productivity/households')]);
    const walletOptions='<option value="">Chọn ví</option>'+state.wallets.filter(item=>!item.archivedAt).map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    $('#recurring-wallet').innerHTML=walletOptions;$('#bill-wallet').innerHTML=walletOptions;
    $('#recurring-list').innerHTML=recurring.map(item=>`<article class="feature-row"><div><strong>${escapeHtml(item.name)}</strong><small>${AGENT_ENUM_LABELS[item.frequency]||item.frequency} · kỳ tới ${shortDate(item.nextRunAt)}${item.autoPost?' · tự động ghi':''}</small></div><b>${moneyCurrency(item.amount,item.wallet.currency)}</b><button data-recurring-delete="${item.id}" class="danger">Xóa</button></article>`).join('')||'<div class="empty">Chưa có giao dịch định kỳ.</div>';
    $('#bill-list').innerHTML=bills.map(item=>`<article class="feature-row"><div><strong>${escapeHtml(item.name)}</strong><small>Hạn ${shortDate(item.dueAt)} · ${({UPCOMING:'Sắp tới',PAID:'Đã trả',OVERDUE:'Quá hạn',SKIPPED:'Bỏ qua'})[item.status]||item.status}</small></div><b>${moneyCurrency(item.amount,item.wallet?.currency||state.user.currency)}</b>${item.status!=='PAID'?`<button data-bill-pay="${item.id}">Đã trả</button>`:''}<button data-bill-delete="${item.id}" class="danger">Xóa</button></article>`).join('')||'<div class="empty">Chưa có hóa đơn cần nhắc.</div>';
    $('#tag-list').innerHTML=tags.map(item=>`<button class="tag-chip" style="--tag-color:${item.color||'#23654f'}" data-tag-delete="${item.id}" title="Xóa nhãn">${escapeHtml(item.name)} ×</button>`).join('')||'<span class="muted">Chưa có nhãn.</span>';
    $('#household-list').innerHTML=households.map(item=>`<article class="feature-row"><div><strong>${escapeHtml(item.name)}</strong><small>${item.members.length} thành viên · Mã mời <code>${item.inviteCode}</code></small></div></article>`).join('')||'<div class="empty">Chưa tham gia nhóm gia đình.</div>';
  }catch(error){toast(error.message,true)}
}
$('#recurring-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('/productivity/recurring',{method:'POST',body:JSON.stringify({name:$('#recurring-name').value,amount:Number($('#recurring-amount').value),walletId:$('#recurring-wallet').value,type:$('#recurring-type').value,frequency:$('#recurring-frequency').value,nextRunAt:new Date(`${$('#recurring-date').value}T12:00:00`).toISOString(),autoPost:$('#recurring-auto').checked})});event.target.reset();$('#recurring-date').value=localDateValue();await loadPlanning();toast('Đã tạo lịch định kỳ.')}catch(error){toast(error.message,true)}});
$('#bill-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('/productivity/bills',{method:'POST',body:JSON.stringify({name:$('#bill-name').value,amount:Number($('#bill-amount').value),walletId:$('#bill-wallet').value||null,dueAt:new Date(`${$('#bill-date').value}T12:00:00`).toISOString(),recurrence:$('#bill-frequency').value||null})});event.target.reset();$('#bill-date').value=localDateValue();await loadPlanning();toast('Đã thêm hóa đơn.')}catch(error){toast(error.message,true)}});
$('#run-recurring').addEventListener('click',async()=>{try{const result=await api('/productivity/recurring/run-due',{method:'POST'});await loadData();render();await loadPlanning();toast(`Đã xử lý ${result.processed} giao dịch.`)}catch(error){toast(error.message,true)}});
$('#recurring-list').addEventListener('click',async event=>{const id=event.target.closest('[data-recurring-delete]')?.dataset.recurringDelete;if(!id)return;if(!confirm('Xóa lịch định kỳ này?'))return;try{await api(`/productivity/recurring/${id}`,{method:'DELETE'});await loadPlanning()}catch(error){toast(error.message,true)}});
$('#bill-list').addEventListener('click',async event=>{const pay=event.target.closest('[data-bill-pay]')?.dataset.billPay;const remove=event.target.closest('[data-bill-delete]')?.dataset.billDelete;try{if(pay){const walletId=$('#bill-wallet').value||state.wallets.find(item=>!item.archivedAt)?.id;await api(`/productivity/bills/${pay}/pay`,{method:'POST',body:JSON.stringify({walletId})});await loadData();render()}if(remove&&confirm('Xóa hóa đơn này?'))await api(`/productivity/bills/${remove}`,{method:'DELETE'});await loadPlanning()}catch(error){toast(error.message,true)}});
$('#tag-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('/productivity/tags',{method:'POST',body:JSON.stringify({name:$('#tag-name').value,color:$('#tag-color').value})});event.target.reset();await loadPlanning()}catch(error){toast(error.message,true)}});
$('#tag-list').addEventListener('click',async event=>{const id=event.target.closest('[data-tag-delete]')?.dataset.tagDelete;if(!id)return;try{await api(`/productivity/tags/${id}`,{method:'DELETE'});await loadPlanning()}catch(error){toast(error.message,true)}});
$('#household-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('/productivity/households',{method:'POST',body:JSON.stringify({name:$('#household-name').value})});event.target.reset();await loadPlanning();toast('Đã tạo nhóm gia đình.')}catch(error){toast(error.message,true)}});
$('#household-join-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('/productivity/households/join',{method:'POST',body:JSON.stringify({inviteCode:$('#household-code').value})});event.target.reset();await loadPlanning();toast('Đã tham gia nhóm.')}catch(error){toast(error.message,true)}});

async function loadInsights(){try{const insight=await api('/insights/overview');const forecast=insight.forecast;$('#insight-metrics').innerHTML=`<article class="metric-card net"><div class="metric-icon">◎</div><div><span>An toàn có thể chi</span><strong>${moneyCurrency(forecast.safeToSpend,state.user.currency)}</strong><small>Sau hóa đơn và mức chi trung bình</small></div></article><article class="metric-card expense"><div class="metric-icon">!</div><div><span>Khoản bất thường</span><strong>${insight.anomalies.length}</strong><small>Cần kiểm tra lại</small></div></article><article class="metric-card income"><div class="metric-icon">↻</div><div><span>Chi định kỳ nhận diện</span><strong>${insight.subscriptions.length}</strong><small>Mẫu lặp có độ tin cậy cao</small></div></article>`;$('#recommendation-list').innerHTML=insight.recommendations.map(item=>`<article class="recommendation ${item.level}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></article>`).join('')||'<div class="empty">Dòng tiền đang ổn định, chưa có cảnh báo mới.</div>'}catch(error){toast(error.message,true)}}
$('#refresh-insights').addEventListener('click',loadInsights);
$('#natural-transaction-form').addEventListener('submit',async event=>{event.preventDefault();try{const parsed=await api('/insights/parse-transaction',{method:'POST',body:JSON.stringify({text:$('#natural-transaction').value})});$('#natural-result').innerHTML=`<strong>${parsed.type==='INCOME'?'Khoản thu':'Khoản chi'} · ${moneyCurrency(parsed.amount,state.user.currency)}</strong><p>${escapeHtml(parsed.note||'Không có ghi chú')} · ${shortDate(parsed.occurredAt)}</p><button id="use-natural-result" class="outline-btn" type="button">Dùng kết quả để tạo giao dịch</button>`;$('#use-natural-result').onclick=()=>{openModal();document.querySelector(`input[name="type"][value="${parsed.type}"]`).checked=true;fillForm();$('#tx-amount').value=parsed.amount;$('#tx-note').value=parsed.note;$('#tx-date').value=localDateValue(new Date(parsed.occurredAt))}}catch(error){toast(error.message,true)}});
$('#assistant-form').addEventListener('submit',async event=>{event.preventDefault();const question=$('#assistant-question').value;const button=event.submitter;button.disabled=true;try{$('#assistant-history').insertAdjacentHTML('beforeend',`<div class="assistant-message user">${escapeHtml(question)}</div>`);const result=await api('/insights/assistant',{method:'POST',body:JSON.stringify({question,history:state.assistantHistory.slice(-6)})});const labels={system:'Sổ Mộc',openai:'OpenAI',deepseek:'DeepSeek'};$('#assistant-history').insertAdjacentHTML('beforeend',`<div class="assistant-message bot"><span>${labels[result.provider]||'Trợ lý AI'} · ${escapeHtml(result.model||'')}</span>${escapeHtml(result.answer)}</div>`);state.assistantHistory.push({role:'user',content:question},{role:'assistant',content:result.answer});state.assistantHistory=state.assistantHistory.slice(-6);event.target.reset();$('#assistant-history').scrollTop=$('#assistant-history').scrollHeight}catch(error){toast(error.message,true)}finally{button.disabled=false}});

async function loadNotifications(){try{await api('/productivity/notifications/generate',{method:'POST'});const items=await api('/productivity/notifications');const unread=items.filter(item=>!item.readAt).length;$('#notification-count').textContent=unread;$('#notification-count').classList.toggle('hidden',!unread);$('#notification-list').innerHTML=items.map(item=>`<article class="notification-item ${item.readAt?'':'unread'}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><small>${shortDate(item.createdAt)}</small></article>`).join('')||'<div class="empty">Chưa có thông báo.</div>'}catch(error){toast(error.message,true)}}
$('#notification-btn').addEventListener('click',async()=>{await loadNotifications();$('#notification-drawer').classList.toggle('hidden')});
$('#close-notifications').addEventListener('click',()=>$('#notification-drawer').classList.add('hidden'));
$('#read-all-notifications').addEventListener('click',async()=>{await api('/productivity/notifications/read-all',{method:'POST'});await loadNotifications()});
function applyTheme(theme){document.documentElement.dataset.theme=theme==='DARK'?'dark':theme==='LIGHT'?'light':'';localStorage.setItem('finance_theme',theme)}
$('#theme-btn').addEventListener('click',async()=>{const next=document.documentElement.dataset.theme==='dark'?'LIGHT':'DARK';applyTheme(next);if(state.user){state.user.theme=next;await api('/profile',{method:'PATCH',body:JSON.stringify({theme:next})}).catch(()=>undefined)}});

async function loadSessions(){const sessions=await api('/auth/sessions');$('#session-list').innerHTML=sessions.map(item=>`<article class="feature-row"><div><strong>${escapeHtml(item.deviceName||'Thiết bị')}</strong><small>${escapeHtml(item.ipAddress||'IP ẩn')} · dùng ${shortDate(item.lastUsedAt)}</small></div><button data-session-revoke="${item.familyId}" class="danger">Thu hồi</button></article>`).join('')||'<div class="empty">Không có phiên hoạt động.</div>'}
$('#open-profile').addEventListener('click',async()=>{try{const profile=await api('/profile');state.user=profile;$('#profile-full-name').value=profile.fullName||'';$('#profile-email').value=profile.email||'';$('#profile-phone').value=profile.phone||'';$('#profile-timezone').value=profile.timezone||'';$('#profile-currency').value=profile.currency||'VND';$('#profile-locale').value=profile.locale||'vi-VN';$('#profile-theme').value=profile.theme||'SYSTEM';$('#account-plan').innerHTML=profile.isVip?`<strong>VIP</strong><span>Không giới hạn lượt hỏi AI${profile.vipExpiresAt?` · đến ${shortDate(profile.vipExpiresAt)}`:' · vĩnh viễn'}</span>`:'<strong>FREE</strong><span>Giới hạn lượt hỏi AI theo ngày</span>';render();await loadSessions();openNamedModal('profile-modal')}catch(error){toast(error.message,true)}});
$('#profile-form').addEventListener('submit',async event=>{event.preventDefault();try{state.user=await api('/profile',{method:'PATCH',body:JSON.stringify({fullName:$('#profile-full-name').value||null,email:$('#profile-email').value||null,phone:$('#profile-phone').value||null,timezone:$('#profile-timezone').value,currency:$('#profile-currency').value.toUpperCase(),locale:$('#profile-locale').value,theme:$('#profile-theme').value})});state.onboarding=await api('/profile/onboarding');applyTheme(state.user.theme);render();toast('Đã cập nhật hồ sơ.')}catch(error){toast(error.message,true)}});
$('#session-list').addEventListener('click',async event=>{const id=event.target.closest('[data-session-revoke]')?.dataset.sessionRevoke;if(!id)return;try{await api(`/auth/sessions/${id}`,{method:'DELETE'});await loadSessions();toast('Đã thu hồi phiên.')}catch(error){toast(error.message,true)}});
$('#verify-email').addEventListener('click',async()=>{try{await api('/auth/verification/email/send',{method:'POST'});toast('Đã gửi email xác minh.')}catch(error){toast(error.message,true)}});
$('#export-data').addEventListener('click',async()=>{try{const response=await fetch('/api/v1/productivity/data-export',{credentials:'same-origin',headers:{Authorization:`Bearer ${state.token}`}});const body=await response.json();if(!response.ok)throw new Error(apiErrorMessage(body));const url=URL.createObjectURL(new Blob([JSON.stringify(body.data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='so-moc-data.json';link.click();URL.revokeObjectURL(url)}catch(error){toast(error.message,true)}});
$('#logout-all').addEventListener('click',async()=>{if(!confirm('Đăng xuất khỏi tất cả thiết bị?'))return;try{await api('/auth/logout-all',{method:'POST'});closeNamedModal('profile-modal');returnToLogin();toast('Đã đăng xuất mọi thiết bị.')}catch(error){toast(error.message,true)}});
$('#delete-account').addEventListener('click',async()=>{const confirmation=prompt('Thao tác này sẽ vô hiệu hóa tài khoản. Nhập chính xác “XOA TAI KHOAN” để tiếp tục:');if(confirmation!=='XOA TAI KHOAN')return;try{await api('/productivity/account',{method:'DELETE',body:JSON.stringify({confirmation})});closeNamedModal('profile-modal');returnToLogin();toast('Tài khoản đã được vô hiệu hóa.')}catch(error){toast(error.message,true)}});
$('#password-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:$('#current-password').value,newPassword:$('#new-password').value})});state.token='';state.refreshToken='';closeNamedModal('profile-modal');$('#app').classList.add('hidden');$('#login-screen').classList.remove('hidden');event.target.reset();toast('Đã đổi mật khẩu. Vui lòng đăng nhập lại.')}catch(error){toast(error.message,true)}});

$('#toggle-login-password').addEventListener('click',event=>{const input=$('#password');const visible=input.type==='text';input.type=visible?'password':'text';event.currentTarget.textContent=visible?'Hiện':'Ẩn';event.currentTarget.setAttribute('aria-label',visible?'Hiện mật khẩu':'Ẩn mật khẩu')});
$('#open-register').addEventListener('click',()=>{ $('#register-form').reset();openNamedModal('register-modal','#register-username')});
$('#register-form').addEventListener('submit',async event=>{event.preventDefault();const password=$('#register-password').value;if(password!==$('#register-confirm-password').value){toast('Mật khẩu nhập lại chưa khớp.',true);$('#register-confirm-password').focus();return}const button=event.submitter;button.disabled=true;try{const data=await api('/auth/register',{method:'POST',body:JSON.stringify({username:$('#register-username').value,email:$('#register-email').value||undefined,phone:$('#register-phone').value||undefined,password,fullName:$('#register-full-name').value||undefined}),skipRefresh:true});closeNamedModal('register-modal');if(!(await enterApp(data)))toast('Tài khoản đã được tạo. Chào mừng bạn!')}catch(error){toast(error.message,true)}finally{button.disabled=false}});
// Quên mật khẩu nhận email của tài khoản, không nhận tên đăng nhập. Ô đăng nhập đang chứa email thì điền sẵn.
$('#open-forgot-password').addEventListener('click',()=>{const typed=$('#identifier').value.trim();$('#forgot-email').value=typed.includes('@')?typed:'';openNamedModal('forgot-password-modal','#forgot-email')});
$('#forgot-password-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api('/auth/forgot-password',{method:'POST',body:JSON.stringify({email:$('#forgot-email').value}),skipRefresh:true});closeNamedModal('forgot-password-modal');toast('Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi. Hãy kiểm tra cả thư mục Spam.')}catch(error){toast(error.message,true)}finally{button.disabled=false}});
$('#reset-password-form').addEventListener('submit',async event=>{event.preventDefault();const password=$('#reset-password').value;if(password!==$('#reset-confirm-password').value){toast('Mật khẩu nhập lại chưa khớp.',true);$('#reset-confirm-password').focus();return}const token=new URLSearchParams(location.search).get('token');if(!token){toast('Liên kết đặt lại mật khẩu không hợp lệ.',true);return}const button=event.submitter;button.disabled=true;try{await api('/auth/reset-password',{method:'POST',body:JSON.stringify({token,newPassword:password}),skipRefresh:true});history.replaceState({},'', '/');closeNamedModal('reset-password-modal');$('#password').value='';$('#identifier').focus();toast('Đã đặt lại mật khẩu. Vui lòng đăng nhập.')}catch(error){toast(error.message,true)}finally{button.disabled=false}});
$('#report-from').value=monthStartValue();$('#report-to').value=localDateValue();
if(location.pathname==='/reset-password'){const token=new URLSearchParams(location.search).get('token');if(token)openNamedModal('reset-password-modal','#reset-password');else toast('Liên kết đặt lại mật khẩu không hợp lệ.',true)}
$('#logout-btn').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST',body:JSON.stringify(state.refreshToken?{refreshToken:state.refreshToken}:{})})}catch(error){console.warn('Không thể thu hồi phiên đăng nhập:',error.message)}finally{returnToLogin();toast('Đã đăng xuất.')}});
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}

function renderMarkdownInline(value){
  const tokens=[];const protect=html=>`\u0000${tokens.push(html)-1}\u0000`;
  let source=String(value??'');
  source=source.replace(/`([^`\n]+)`/g,(_,code)=>protect(`<code>${escapeHtml(code)}</code>`));
  source=source.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/gi,(_,label,url)=>protect(`<a href="${escapeHtml(url)}"${/^https?:\/\//i.test(url)?' target="_blank" rel="noopener noreferrer"':''}>${escapeHtml(label)}</a>`));
  let html=escapeHtml(source)
    .replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g,'<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g,'<del>$1</del>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g,'$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g,'$1<em>$2</em>');
  return html.replace(/\u0000(\d+)\u0000/g,(_,index)=>tokens[Number(index)]||'');
}

function renderMarkdown(value){
  const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n');const output=[];
  const tableSeparator=line=>/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
  const startsBlock=(index)=>{const line=lines[index]||'';return /^\s*```/.test(line)||/^\s{0,3}#{1,4}\s+/.test(line)||/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)||/^\s*[-+*]\s+/.test(line)||/^\s*\d+[.)]\s+/.test(line)||/^\s*>\s?/.test(line)||(line.includes('|')&&tableSeparator(lines[index+1]||''))};
  for(let index=0;index<lines.length;){
    const line=lines[index];if(!line.trim()){index+=1;continue}
    const fence=line.match(/^\s*```([\w-]*)\s*$/);if(fence){const code=[];index+=1;while(index<lines.length&&!/^\s*```\s*$/.test(lines[index]))code.push(lines[index++]);if(index<lines.length)index+=1;const language=fence[1]?` class="language-${escapeHtml(fence[1])}"`:'';output.push(`<pre><code${language}>${escapeHtml(code.join('\n'))}</code></pre>`);continue}
    if(line.includes('|')&&tableSeparator(lines[index+1]||'')){const headings=cells(line);index+=2;const rows=[];while(index<lines.length&&lines[index].trim()&&lines[index].includes('|'))rows.push(cells(lines[index++]));output.push(`<div class="agent-table-wrap"><table><thead><tr>${headings.map(cell=>`<th>${renderMarkdownInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headings.map((_,cellIndex)=>`<td>${renderMarkdownInline(row[cellIndex]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue}
    const heading=line.match(/^\s{0,3}(#{1,4})\s+(.+)$/);if(heading){const level=Math.min(5,heading[1].length+2);output.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);index+=1;continue}
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){output.push('<hr>');index+=1;continue}
    const unordered=/^\s*[-+*]\s+(.+)$/.exec(line);const ordered=/^\s*\d+[.)]\s+(.+)$/.exec(line);if(unordered||ordered){const tag=unordered?'ul':'ol';const items=[];while(index<lines.length){const match=(tag==='ul'?/^\s*[-+*]\s+(.+)$/:/^\s*\d+[.)]\s+(.+)$/).exec(lines[index]);if(!match)break;items.push(`<li>${renderMarkdownInline(match[1])}</li>`);index+=1}output.push(`<${tag}>${items.join('')}</${tag}>`);continue}
    if(/^\s*>\s?/.test(line)){const quote=[];while(index<lines.length&&/^\s*>\s?/.test(lines[index]))quote.push(lines[index++].replace(/^\s*>\s?/,''));output.push(`<blockquote>${quote.map(renderMarkdownInline).join('<br>')}</blockquote>`);continue}
    const paragraph=[line];index+=1;while(index<lines.length&&lines[index].trim()&&!startsBlock(index))paragraph.push(lines[index++]);output.push(`<p>${paragraph.map(renderMarkdownInline).join('<br>')}</p>`);
  }
  return output.join('');
}

async function initializeApp(){
  applyTheme(localStorage.getItem('finance_theme')||'SYSTEM');
  $('#recurring-date').value=localDateValue();$('#bill-date').value=localDateValue();
  try{const providers=await api('/auth/oauth/providers',{skipRefresh:true});$('#oauth-google').classList.toggle('hidden',!providers.google);$('#oauth-github').classList.toggle('hidden',!providers.github);$('#oauth-providers').classList.toggle('hidden',!providers.google&&!providers.github);$('#demo-note').classList.toggle('hidden',!providers.demoEnabled);$('#login-description').textContent=providers.demoEnabled?'Dùng tài khoản demo hoặc đăng nhập bằng tài khoản của bạn.':'Đăng nhập để tiếp tục quản lý tài chính cá nhân.'}catch{$('#oauth-providers').classList.add('hidden');$('#demo-note').classList.add('hidden')}
  const verifyToken=new URLSearchParams(location.search).get('verify');
  if(verifyToken){try{await api('/auth/verification/email/confirm',{method:'POST',body:JSON.stringify({token:verifyToken}),skipRefresh:true});history.replaceState({},'', '/');toast('Email đã được xác minh.')}catch(error){toast(error.message,true)}}
  if(location.pathname==='/reset-password')return;
  try{const status=await api('/auth/session-status',{skipRefresh:true});if(status.authenticated){const data=await api('/auth/session',{method:'POST',body:'{}',skipRefresh:true});await enterApp(data);applyTheme(data.user.theme||'SYSTEM');void loadNotifications();if(new URLSearchParams(location.search).get('oauth')){history.replaceState({},'', '/');toast('Đăng nhập liên kết thành công.')}}else{returnToLogin()}}catch{returnToLogin()}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>undefined);
}
void initializeApp();

// Agent tài chính: một khung chat, hành động có xem trước, xác nhận và hoàn tác.
function setupAgentShell(){
  const view=$('#view-insights');if(!view||$('#agent-toolbar'))return;
  view.querySelector(':scope > .section-title')?.classList.add('hidden');
  $('#insight-metrics')?.classList.add('hidden');
  view.querySelector(':scope > .automation-grid')?.classList.add('hidden');
  const panel=view.querySelector('.assistant-panel');panel.classList.add('agent-panel');
  panel.querySelector('h2').textContent='Agent tài chính Sổ Mộc';
  panel.querySelector('.eyebrow').textContent='TRÒ CHUYỆN VÀ LÀM VIỆC';
  panel.querySelector('.privacy-note').textContent='Mọi thay đổi đều cần bạn xác nhận';
  panel.querySelector('.panel-head').insertAdjacentHTML('afterend',`<div id="agent-toolbar" class="agent-toolbar"><select id="agent-conversation" aria-label="Cuộc trò chuyện"><option value="">Cuộc trò chuyện mới</option></select><button id="agent-new" class="outline-btn" type="button">＋ Mới</button><button id="agent-delete" class="outline-btn danger" type="button">Xóa</button></div><div id="agent-consent" class="agent-consent hidden"></div>`);
  const form=$('#assistant-form');$('#assistant-question').placeholder='Ví dụ: Ghi 120 nghìn tiền ăn trưa hôm qua bằng ví Tiền mặt';
  form.insertAdjacentHTML('afterbegin','<label class="agent-attach" title="Đọc ảnh hóa đơn">📎<input id="agent-receipt" type="file" accept="image/jpeg,image/png" hidden></label>');
  form.querySelector('button').textContent='Gửi';
}

const AGENT_PREVIEW_LABELS={amount:'Số tiền',wallet:'Ví',category:'Danh mục',parent:'Danh mục cha',name:'Tên',type:'Loại',walletType:'Loại ví',occurredAt:'Thời gian',startDate:'Bắt đầu',endDate:'Kết thúc',targetAmount:'Mục tiêu',currentAmount:'Hiện có',targetDate:'Hạn',openingBalance:'Số dư đầu',note:'Ghi chú',from:'Từ ví',to:'Đến ví',count:'Số lượng',categories:'Danh mục',goal:'Mục tiêu',budget:'Ngân sách',bill:'Hóa đơn',dueAt:'Hạn thanh toán',frequency:'Chu kỳ',nextRunAt:'Lần chạy tới',autoPost:'Tự ghi sổ',rollover:'Chuyển phần dư',recurrence:'Lặp lại',currentBalance:'Số dư hiện tại',actualBalance:'Số dư thực tế',adjustment:'Điều chỉnh',field:'Trường',operator:'Điều kiện',value:'Giá trị',tagName:'Nhãn',priority:'Ưu tiên',payee:'Người nhận',status:'Trạng thái'};
// Trường kỹ thuật không có ý nghĩa với người dùng (mã màu, ID) hoặc đã hiển thị cùng số tiền (tiền tệ).
const AGENT_PREVIEW_HIDDEN=new Set(['title','currency','color','parentId','walletId','categoryId','changes']);
const AGENT_ENUM_LABELS={EXPENSE:'Chi',INCOME:'Thu',TRANSFER:'Chuyển khoản',CASH:'Tiền mặt',BANK:'Ngân hàng',E_WALLET:'Ví điện tử',CREDIT:'Thẻ tín dụng',OTHER:'Khác',DAILY:'Hằng ngày',WEEKLY:'Hằng tuần',MONTHLY:'Hằng tháng',QUARTERLY:'Hằng quý',YEARLY:'Hằng năm',CLEARED:'Đã ghi sổ',PENDING:'Đang chờ',PLANNED:'Dự kiến',RECONCILED:'Đã đối soát',CANCELLED:'Đã hủy',ACTIVE:'Đang thực hiện',PAUSED:'Tạm dừng',COMPLETED:'Hoàn thành'};
const AGENT_STATUS_LABELS={PENDING:'Chờ xác nhận',EXECUTED:'Đã lưu',CANCELLED:'Đã hủy',UNDONE:'Đã hoàn tác',EXPIRED:'Đã hết hạn',FAILED:'Không thực hiện được'};
const AGENT_MONEY_KEYS=['amount','targetAmount','currentAmount','openingBalance','currentBalance','actualBalance','adjustment'];
const AGENT_DATE_KEYS=['occurredAt','startDate','endDate','targetDate','dueAt','nextRunAt'];

function agentPreviewValue(key,value,preview,kind){
  if(value===null||value===undefined||value==='')return '—';
  if(kind==='money'||AGENT_MONEY_KEYS.includes(key))return moneyCurrency(value,preview.currency||state.user.currency);
  if(kind==='date'||AGENT_DATE_KEYS.includes(key))return shortDate(value);
  if(typeof value==='boolean')return value?'Có':'Không';
  return AGENT_ENUM_LABELS[value]||String(value);
}

function agentActionDetailsHtml(action){
  const preview=action.preview||{};
  const rows=Object.entries(preview).filter(([key,value])=>!AGENT_PREVIEW_HIDDEN.has(key)&&value!==null&&value!==undefined&&value!=='').map(([key,value])=>`<div><span>${escapeHtml(AGENT_PREVIEW_LABELS[key]||key)}</span><b>${escapeHtml(agentPreviewValue(key,value,preview))}</b></div>`);
  // Mới: `changes` là danh sách {label, from, to}. Bản xem trước cũ lưu object thô, chỉ hiện giá trị mới và bỏ trường ID.
  const changes=Array.isArray(preview.changes)?preview.changes.map(change=>`<div class="agent-change"><span>${escapeHtml(change.label)}</span><b>${escapeHtml(agentPreviewValue('',change.from,preview,change.kind))} → ${escapeHtml(agentPreviewValue('',change.to,preview,change.kind))}</b></div>`):preview.changes&&typeof preview.changes==='object'?Object.entries(preview.changes).filter(([key])=>!/Id$/.test(key)&&!AGENT_PREVIEW_HIDDEN.has(key)).map(([key,value])=>`<div><span>${escapeHtml(AGENT_PREVIEW_LABELS[key]||key)}</span><b>${escapeHtml(agentPreviewValue(key,value,preview))}</b></div>`):[];
  return [...rows,...changes].join('');
}

/** Một thẻ cho cả nhóm thay đổi Agent đề xuất trong cùng một lượt: xác nhận, hủy, hoàn tác đều áp dụng cho cả nhóm. */
function agentActionGroupHtml(actions){
  const count=actions.length;const statuses=actions.map(item=>item.status);
  const status=statuses.includes('PENDING')?'PENDING':statuses.includes('EXECUTED')?'EXECUTED':statuses[0];
  const anchor=actions.find(item=>item.status===status)||actions[0];
  const single=count===1;const risky=actions.some(item=>item.risk==='HIGH');
  const groupTitles={PENDING:`${count} thay đổi chờ xác nhận`,EXECUTED:`Đã lưu ${count} thay đổi`,CANCELLED:`Đã hủy ${count} thay đổi`,UNDONE:`Đã hoàn tác ${count} thay đổi`,EXPIRED:`${count} thay đổi đã hết hạn`,FAILED:`${count} thay đổi không thực hiện được`};
  const title=single?(anchor.preview?.title||anchor.type):groupTitles[status]||`${count} thay đổi`;
  const body=single?`<div class="agent-action-details">${agentActionDetailsHtml(anchor)}</div>`:`<ol class="agent-action-items">${actions.map(item=>`<li><b class="agent-action-item-title">${escapeHtml(item.preview?.title||item.type)}</b><div class="agent-action-details">${agentActionDetailsHtml(item)}</div></li>`).join('')}</ol>`;
  const controls=status==='PENDING'?`<button class="primary-btn compact" data-agent-confirm="${anchor.id}">${single?'Xác nhận':`Xác nhận tất cả (${count})`}</button><button class="outline-btn" data-agent-cancel="${anchor.id}">${single?'Hủy':'Hủy tất cả'}</button>`:status==='EXECUTED'?`<span class="agent-status">${AGENT_STATUS_LABELS.EXECUTED}</span><button class="outline-btn" data-agent-undo="${anchor.id}" data-agent-count="${count}">${single?'Hoàn tác':'Hoàn tác cả nhóm'}</button>`:`<span class="agent-status">${escapeHtml(AGENT_STATUS_LABELS[status]||status)}</span>`;
  return `<article class="agent-action ${status.toLowerCase()}${risky?' high-risk':''}" data-agent-action="${anchor.id}"><strong>${escapeHtml(title)}</strong>${risky&&status==='PENDING'?'<p class="agent-action-warning">Có thay đổi xóa hoặc lưu trữ dữ liệu, hãy kiểm tra kỹ.</p>':''}${body}<div class="agent-action-controls">${controls}</div></article>`;
}

function groupAgentActions(actions){
  const groups=new Map();
  for(const action of actions||[]){const key=action.batchId||action.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(action)}
  return [...groups.values()];
}

function agentActionHtml(action){return agentActionGroupHtml([action])}

function agentAttachmentsHtml(attachments){return (attachments||[]).map(item=>`<button type="button" class="agent-download outline-btn" data-agent-download="${escapeHtml(item.url)}" data-agent-filename="${escapeHtml(item.filename||'transactions.csv')}">↓ ${escapeHtml(item.label||'Tải tệp')}</button>`).join('')}

async function streamAgentText(element,text){
  if(!element)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden){element.innerHTML=renderMarkdown(text);return}
  element.classList.add('streaming');element.innerHTML='';
  const chunkSize=Math.max(2,Math.ceil(text.length/120));
  for(let index=0;index<text.length;index+=chunkSize){const visibleText=text.slice(0,index+chunkSize);element.innerHTML=renderMarkdown(visibleText);if(index%(chunkSize*6)===0){const history=$('#assistant-history');history.scrollTop=history.scrollHeight}await new Promise(resolve=>requestAnimationFrame(resolve))}
  element.innerHTML=renderMarkdown(text);element.classList.remove('streaming');
}

function renderAgentMessages(data){
  const history=$('#assistant-history');
  const messages=data?.messages||[];const actions=data?.actions||[];
  // Action được tạo trong lúc Agent đang xử lý, trước khi câu trả lời được lưu. Đặt thẻ nhóm ngay SAU câu trả lời
  // đầu tiên được lưu sau nó (câu trả lời của cùng lượt), để lời nhắc "bạn xác nhận nhé" nằm phía trên thẻ.
  const pendingGroups=groupAgentActions(actions).map(items=>({items,at:new Date(items[0].createdAt).getTime()})).sort((a,b)=>a.at-b.at);
  const timeline=[];
  for(const item of messages){timeline.push({kind:'message',item});if(item.role==='assistant'){const at=new Date(item.createdAt).getTime();while(pendingGroups.length&&pendingGroups[0].at<=at)timeline.push({kind:'actions',items:pendingGroups.shift().items})}}
  for(const group of pendingGroups)timeline.push({kind:'actions',items:group.items});
  history.innerHTML=timeline.map(entry=>{if(entry.kind==='actions')return agentActionGroupHtml(entry.items);const item=entry.item;const failed=item.status==='failed';const content=item.role==='assistant'?`<div class="agent-markdown">${renderMarkdown(item.content)}</div>`:escapeHtml(item.content);return `<div class="assistant-message ${item.role==='user'?'user':'bot'}${failed?' failed':''}">${item.role==='assistant'?`<span title="${escapeHtml([item.provider,item.model].filter(Boolean).join(' · '))}">Sổ Mộc</span>`:''}${content}${failed?`<small>Không xử lý được · ${escapeHtml(item.errorCode||'AI_ERROR')}</small><button type="button" class="text-btn" data-agent-retry="${item.id}" data-agent-question="${escapeHtml(item.content)}">Thử lại</button>`:''}</div>`}).join('');
  if(!messages.length)history.innerHTML='<div class="assistant-message bot"><span>Sổ Mộc Agent</span><div class="agent-markdown"><p>Chào bạn! Tôi có thể phân tích tài chính hoặc làm giúp bạn các việc như ghi giao dịch, tạo ví, danh mục, ngân sách và mục tiêu. Mọi thay đổi sẽ được cho bạn xem trước.</p></div></div>';
  history.scrollTop=history.scrollHeight;
}

async function refreshAgentConversations(selectCurrent=true){
  state.assistantConversations=await api('/insights/conversations');
  const select=$('#agent-conversation');select.innerHTML='<option value="">Cuộc trò chuyện mới</option>'+state.assistantConversations.map(item=>`<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('');
  if(selectCurrent&&state.assistantConversationId)select.value=state.assistantConversationId;
}

async function loadAgentConversation(id){
  state.assistantConversationId=id||null;
  if(!id){renderAgentMessages(null);$('#agent-conversation').value='';return}
  const data=await api(`/insights/conversations/${id}/messages`);renderAgentMessages(data);$('#agent-conversation').value=id;
}

function renderAgentConsent(){
  const box=$('#agent-consent');if(!state.agentSettings?.externalAiEnabled){box.classList.remove('hidden');box.innerHTML='<span>Trợ lý AI chưa được cấu hình trên máy chủ này (thiếu khóa nhà cung cấp AI). Các chức năng khác của Sổ Mộc vẫn dùng bình thường.</span>';return}
  const quota=state.agentSettings.unlimited?'VIP · Không giới hạn lượt hỏi':`${state.agentSettings.remainingToday}/${state.agentSettings.dailyLimit} lượt còn lại hôm nay`;
  box.classList.remove('hidden');box.innerHTML=state.agentSettings.consent?`<span>✓ Đã cho phép ${escapeHtml(state.agentSettings.provider)} xử lý nội dung chat và dữ liệu cần thiết, gồm dữ liệu nhạy cảm bạn chủ động gửi. <b>${escapeHtml(quota)}</b></span><button id="agent-consent-toggle" class="text-btn" type="button">Thu hồi</button>`:`<span>Để dùng AI bên ngoài, hệ thống gửi: ${escapeHtml(state.agentSettings.disclosure.join(', '))}. Không gửi mật khẩu, token hay khóa bí mật. <b>${escapeHtml(quota)}</b></span><button id="agent-consent-toggle" class="primary-btn compact" type="button">Đồng ý sử dụng AI</button>`;
  $('#agent-consent-toggle').onclick=async()=>{try{const consent=!state.agentSettings.consent;await api('/insights/settings',{method:'PUT',body:JSON.stringify({consent})});state.agentSettings.consent=consent;renderAgentConsent();toast(consent?'Đã bật AI cho agent.':'Đã thu hồi quyền sử dụng AI.')}catch(error){toast(error.message,true)}};
}

async function loadAgentUi(){
  setupAgentShell();
  try{[state.agentSettings]=await Promise.all([api('/insights/settings'),refreshAgentConversations()]);renderAgentConsent();if(state.assistantConversationId)await loadAgentConversation(state.assistantConversationId);else renderAgentMessages(null)}catch(error){toast(error.message,true)}
}

const legacyLoadInsights=loadInsights;
loadInsights=loadAgentUi;

async function sendAgentMessage(question,retryMessageId){
  const history=$('#assistant-history');history.querySelector('.agent-thinking')?.remove();history.querySelectorAll('.agent-empty,.agent-prompt-chips').forEach(item=>item.remove());history.insertAdjacentHTML('beforeend',`${retryMessageId?'':`<div class="assistant-message user">${escapeHtml(question)}</div>`}<div class="assistant-message bot agent-thinking"><span>Sổ Mộc</span>Đang suy nghĩ và tự chọn công cụ phù hợp…</div>`);history.scrollTop=history.scrollHeight;
  const result=await api('/insights/assistant',{method:'POST',body:JSON.stringify({question,conversationId:state.assistantConversationId||undefined,retryMessageId,uiContext:{currentView:state.currentView}})});
  state.assistantConversationId=result.conversationId;history.querySelector('.agent-thinking')?.remove();
  if(result.onboarding){state.onboarding=result.onboarding;renderOnboarding()}
  const message=document.createElement('div');message.className='assistant-message bot';message.innerHTML=`<span title="${escapeHtml([result.provider,result.model].filter(Boolean).join(' · '))}">Sổ Mộc</span><div class="agent-stream-text agent-markdown" aria-live="polite"></div>`;history.appendChild(message);
  await streamAgentText(message.querySelector('.agent-stream-text'),result.answer);
  message.insertAdjacentHTML('beforeend',agentAttachmentsHtml(result.attachments)+agentUiActionsHtml(result.uiActions));history.insertAdjacentHTML('beforeend',groupAgentActions(result.actions).map(agentActionGroupHtml).join(''));
  await refreshAgentConversations();history.scrollTop=history.scrollHeight;
}

$('#assistant-form').addEventListener('submit',async event=>{event.preventDefault();event.stopImmediatePropagation();const question=$('#assistant-question').value.trim();if(!question)return;const button=event.submitter||event.currentTarget.querySelector('button');button.disabled=true;$('#assistant-question').value='';try{await sendAgentMessage(question)}catch(error){document.querySelector('.agent-thinking')?.remove();if(error.details?.conversationId){state.assistantConversationId=error.details.conversationId;await refreshAgentConversations();await loadAgentConversation(state.assistantConversationId)}toast(error.message,true)}finally{button.disabled=false}},true);

document.addEventListener('change',async event=>{
  if(event.target.id==='agent-conversation'){try{await loadAgentConversation(event.target.value)}catch(error){toast(error.message,true)}}
  if(event.target.id==='agent-receipt'&&event.target.files?.[0]){const file=event.target.files[0];const form=new FormData();form.append('receipt',file);try{const response=await fetch('/api/v1/insights/extract-receipt-image',{method:'POST',credentials:'same-origin',headers:{Authorization:`Bearer ${state.token}`},body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(apiErrorMessage(body));const receipt=body.data;if(!Number(receipt.amount)){toast('Không đọc được số tiền trên hóa đơn. Bạn thử ảnh rõ và thẳng hơn, hoặc nhắn số tiền để Agent ghi giúp.',true);return}const known=[receipt.merchant&&`cửa hàng ${receipt.merchant}`,`tổng tiền ${receipt.amount} ${receipt.currency||state.user.currency}`,receipt.occurredAt&&`ngày ${String(receipt.occurredAt).slice(0,10)}`].filter(Boolean).join(', ');await sendAgentMessage(`Hãy tạo bản nháp giao dịch từ hóa đơn: ${known}.`)}catch(error){toast(error.message,true)}finally{event.target.value=''}}
});

document.addEventListener('click',async event=>{
  const confirmId=event.target.closest('[data-agent-confirm]')?.dataset.agentConfirm;const cancelId=event.target.closest('[data-agent-cancel]')?.dataset.agentCancel;const undoId=event.target.closest('[data-agent-undo]')?.dataset.agentUndo;
  try{
    const retry=event.target.closest('[data-agent-retry]');if(retry){retry.disabled=true;try{await sendAgentMessage(retry.dataset.agentQuestion,retry.dataset.agentRetry)}finally{retry.disabled=false}}
    const downloadButton=event.target.closest('[data-agent-download]');const downloadUrl=downloadButton?.dataset.agentDownload;if(downloadUrl){const response=await fetch(downloadUrl,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok)throw new Error('Không thể tải tệp.');const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=downloadButton.dataset.agentFilename||'download';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}
    const actionButton=event.target.closest('[data-agent-confirm],[data-agent-cancel],[data-agent-undo]');
    const card=actionButton?.closest('.agent-action');if(card)card.querySelectorAll('button').forEach(button=>{button.disabled=true});
    if(confirmId){const result=await api(`/insights/actions/${confirmId}/confirm`,{method:'POST'});const count=(result.actions||[]).length||1;toast(count>1?`Đã lưu ${count} thay đổi.`:'Đã lưu thay đổi.');await loadData();render();await loadAgentConversation(state.assistantConversationId)}
    if(cancelId){await api(`/insights/actions/${cancelId}/cancel`,{method:'POST'});await loadAgentConversation(state.assistantConversationId)}
    const undoCount=Number(event.target.closest('[data-agent-undo]')?.dataset.agentCount||1);
    if(undoId){if(window.confirm(undoCount>1?`Hoàn tác cả ${undoCount} thay đổi?`:'Hoàn tác thay đổi này?')){await api(`/insights/actions/${undoId}/undo`,{method:'POST'});toast('Đã hoàn tác.');await loadData();render();await loadAgentConversation(state.assistantConversationId)}else if(card)card.querySelectorAll('button').forEach(button=>{button.disabled=false})}
    if(event.target.id==='agent-new'){state.assistantConversationId=null;renderAgentMessages(null);$('#agent-conversation').value='';$('#assistant-question').focus()}
    if(event.target.id==='agent-delete'&&state.assistantConversationId&&window.confirm('Xóa cuộc trò chuyện này?')){await api(`/insights/conversations/${state.assistantConversationId}`,{method:'DELETE'});state.assistantConversationId=null;await refreshAgentConversations();renderAgentMessages(null)}
  }catch(error){document.querySelectorAll('.agent-action button:disabled').forEach(button=>{button.disabled=false});toast(error.message,true)}
});

// Hướng dẫn người mới và các cải tiến điều hướng/ngữ cảnh.
const baseRender=render;
render=function enhancedRender(){baseRender();renderOnboarding()};

const baseShowView=showView;
showView=function enhancedShowView(view,options={}){
  if(!document.getElementById(`view-${view}`))view='dashboard';
  baseShowView(view);state.currentView=view;
  $$('.nav-item').forEach(item=>item.setAttribute('aria-current',item.dataset.view===view?'page':'false'));
  if(!options.fromHistory){const method=options.replace?'replaceState':'pushState';history[method]({view},'',`#${view}`)}
  if(!options.keepScroll)window.scrollTo({top:0,behavior:options.smooth?'smooth':'auto'});
  if(view==='reports')void refreshReportVisuals();
};
window.addEventListener('hashchange',()=>{if(state.user)showView(location.hash.replace('#','')||'dashboard',{fromHistory:true})});

function nextOnboardingStep(){return state.onboarding?.steps?.find(step=>!step.completed)||null}
function renderOnboarding(){
  const card=$('#onboarding-card');if(!card||!state.onboarding)return;
  const data=state.onboarding;card.classList.toggle('hidden',data.completed||data.dismissed);
  $('#onboarding-progress-label').textContent=`${data.completedCount}/${data.totalSteps} bước`;
  $('#onboarding-progress-bar').style.width=`${data.progressPercent}%`;
  $('#onboarding-steps').innerHTML=data.steps.map((step,index)=>`<button class="onboarding-step${step.completed?' done':''}" type="button" data-onboarding-step="${escapeHtml(step.id)}"><span class="onboarding-step-number">${step.completed?'✓':index+1}</span><span><strong>${escapeHtml(step.title)}</strong><small>${step.completed?'Đã hoàn thành':escapeHtml(step.actionLabel)}</small></span></button>`).join('');
  const next=nextOnboardingStep();$('#onboarding-continue').textContent=next?next.actionLabel:'Xem tổng quan';
}


async function setOnboardingPreference(patch){state.onboarding=await api('/profile/onboarding',{method:'PATCH',body:JSON.stringify(patch)});renderOnboarding()}
// Trả về true khi đã mở slide chào mừng, để nơi gọi không bật thêm thông báo đè lên.
function maybeShowOnboarding(){
  if(!state.onboarding||state.onboarding.completed||state.onboarding.dismissed||state.onboarding.welcomeSeen)return false;
  openWelcome();return true;
}

async function performOnboardingStep(stepId){
  const step=state.onboarding?.steps?.find(item=>item.id===stepId)||nextOnboardingStep();if(!step){showView('dashboard');return}
  if(step.id==='profile'){$('#open-profile').click();return}
  // Các bước còn lại làm ngay trong slide thiết lập: nhanh hơn mở từng form đầy đủ.
  openWelcome(step.id);
}

function openAgentWithPrompt(prompt){
  showView('insights');
  const input=$('#assistant-question');input.value=prompt;input.focus();
}

$('#onboarding-continue').addEventListener('click',()=>performOnboardingStep(nextOnboardingStep()?.id));
$('#onboarding-steps').addEventListener('click',event=>{const step=event.target.closest('[data-onboarding-step]');if(step)performOnboardingStep(step.dataset.onboardingStep)});
$('#onboarding-dismiss').addEventListener('click',async()=>{try{await setOnboardingPreference({dismissed:true});toast('Muốn làm lại, bấm ảnh đại diện › Làm lại thiết lập ban đầu.')}catch(error){toast(error.message,true)}});
$('#onboarding-ask-agent').addEventListener('click',()=>openAgentWithPrompt('Tôi mới sử dụng Sổ Mộc. Hãy xem trạng thái thiết lập và hướng dẫn tôi bước phù hợp tiếp theo.'));

$('#mobile-add-transaction').addEventListener('click',()=>openModal());

const baseOpenModal=openModal;
openModal=function enhancedOpenModal(transaction=null){baseOpenModal(transaction);const details=$('#transaction-advanced');if(details)details.open=Boolean(transaction&&(transaction.status!=='CLEARED'||transaction.paymentMethod||transaction.reference||transaction.location||(transaction.receipts||[]).length))};

function renderReportBars(summary){
  const monthly=summary.monthly||[];const categories=(summary.expenseByCategory||[]).slice(0,6);const monthlyMax=Math.max(1,...monthly.flatMap(item=>[Number(item.income||0),Number(item.expense||0)]));const categoryMax=Math.max(1,...categories.map(item=>Number(item.amount||0)));
  $('#report-monthly-chart').innerHTML='<strong>Thu và chi theo tháng</strong>'+monthly.flatMap(item=>[{label:`${item.month} · Thu`,value:Number(item.income||0),kind:'income'},{label:`${item.month} · Chi`,value:Number(item.expense||0),kind:'expense'}]).map(item=>`<div class="report-bar ${item.kind}"><span>${escapeHtml(item.label)}</span><div class="report-bar-track"><span style="width:${item.value/monthlyMax*100}%"></span></div><b>${moneyCurrency(item.value,state.user.currency)}</b></div>`).join('');
  $('#report-category-chart').innerHTML='<strong>Nhóm chi tiêu lớn nhất</strong>'+categories.map(item=>`<div class="report-bar expense"><span>${escapeHtml(item.categoryName)}</span><div class="report-bar-track"><span style="width:${Number(item.amount)/categoryMax*100}%"></span></div><b>${moneyCurrency(item.amount,item.currency||state.user.currency)}</b></div>`).join('');
  $('#report-visuals').classList.toggle('hidden',!monthly.length&&!categories.length);
}
async function refreshReportVisuals(){const params=new URLSearchParams();if($('#report-from').value)params.set('from',$('#report-from').value);if($('#report-to').value)params.set('to',$('#report-to').value);try{renderReportBars(await api(`/reports/summary?${params}`))}catch(error){toast(error.message,true)}}


// Bốn khối của màn Định kỳ/Hóa đơn/Nhãn/Gia đình hiện từng khối một, chọn bằng tab con của Kế hoạch.
function setupPlanningTabs(){
  const view=$('#view-planning');if(!view)return;
  const ids=['recurring','bills','tags','household'];
  [...view.querySelectorAll('.automation-grid > .panel')].forEach((panel,index)=>{panel.dataset.planningPanel=ids[index];panel.classList.toggle('hidden',index!==0)});view.querySelectorAll('.automation-grid').forEach(grid=>grid.classList.add('planning-tab-grid'));
}
function selectPlanningTab(id){state.planningTab=id;$$('#view-planning [data-planning-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.planningPanel!==id))}
setupPlanningTabs();

function friendlyDevice(session){
  const source=`${session.deviceName||''} ${session.userAgent||''}`;const browser=/Edg/i.test(source)?'Microsoft Edge':/Firefox/i.test(source)?'Firefox':/Chrome/i.test(source)?'Chrome':/Safari/i.test(source)?'Safari':'Trình duyệt';const os=/Windows/i.test(source)?'Windows':/Android/i.test(source)?'Android':/iPhone|iPad/i.test(source)?'iOS/iPadOS':/Mac OS/i.test(source)?'macOS':/Linux/i.test(source)?'Linux':'thiết bị không xác định';return `${browser} trên ${os}`
}
loadSessions=async function enhancedLoadSessions(){const sessions=await api('/auth/sessions');$('#session-list').innerHTML=sessions.map(item=>{const current=item.userAgent===navigator.userAgent||item.deviceName===navigator.userAgent.slice(0,120);return `<article class="feature-row"><div><strong>${escapeHtml(friendlyDevice(item))}${current?' · Thiết bị này':''}</strong><small>Hoạt động ${shortDate(item.lastUsedAt)}${item.ipAddress?' · '+escapeHtml(item.ipAddress.replace(/\d+$/,'•••')):''}</small></div><button data-session-revoke="${item.familyId}" class="danger"${current?' title="Thu hồi sẽ đăng xuất thiết bị này"':''}>Thu hồi</button></article>`}).join('')||'<div class="empty">Không có phiên hoạt động.</div>'};

function agentUiActionsHtml(actions){return (actions||[]).map(action=>`<button type="button" class="agent-ui-action" data-agent-open-view="${escapeHtml(action.view||'dashboard')}">${escapeHtml(action.label||'Mở màn hình')}</button>`).join('')?`<div class="agent-ui-actions">${(actions||[]).map(action=>`<button type="button" class="agent-ui-action" data-agent-open-view="${escapeHtml(action.view||'dashboard')}">${escapeHtml(action.label||'Mở màn hình')}</button>`).join('')}</div>`:''}
function contextualAgentPrompts(){const next=nextOnboardingStep();return [next?`Hướng dẫn tôi ${next.title.toLocaleLowerCase('vi-VN')}`:'Phân tích tình hình tài chính của tôi','Agent có thể làm gì cho tôi?','Tôi nên chú ý điều gì trong tháng này?']}
const baseRenderAgentMessages=renderAgentMessages;
renderAgentMessages=function enhancedRenderAgentMessages(data){baseRenderAgentMessages(data);if(!(data?.messages||[]).length){$('#assistant-history').innerHTML=`<div class="agent-empty"><strong>Bắt đầu theo cách tự nhiên</strong><span>Hỏi một câu hoặc giao việc; Agent sẽ tự chọn công cụ khi cần và luôn cho bạn xem trước thay đổi.</span></div><div class="agent-prompt-chips">${contextualAgentPrompts().map(prompt=>`<button type="button" class="agent-prompt-chip" data-agent-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}</div>`} };
document.addEventListener('click',event=>{const prompt=event.target.closest('[data-agent-prompt]')?.dataset.agentPrompt;if(prompt){$('#assistant-question').value=prompt;$('#assistant-question').focus()}const action=event.target.closest('[data-agent-open-view]');if(action){if(action.dataset.agentOpenView==='profile')$('#open-profile').click();else showView(action.dataset.agentOpenView)}});

// Tải báo cáo dạng CSV (tổng hợp theo khoảng ngày đang chọn, và đối soát số dư ví).
async function downloadReportCsv(path,fallbackName){try{const response=await fetch(path,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(apiErrorMessage(body)||'Không thể xuất CSV.')}const name=/filename="([^"]+)"/.exec(response.headers.get('Content-Disposition')||'')?.[1]||fallbackName;const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(error){toast(error.message,true)}}
$('#export-summary-csv').addEventListener('click',()=>{const params=new URLSearchParams({format:'csv'});if($('#report-from').value)params.set('from',$('#report-from').value);if($('#report-to').value)params.set('to',$('#report-to').value);downloadReportCsv(`/api/v1/reports/summary?${params}`,'bao-cao-tong-hop.csv')});
$('#export-reconciliation-csv').addEventListener('click',()=>downloadReportCsv('/api/v1/reports/reconciliation?format=csv','doi-soat-vi.csv'));

// Bố cục gọn cho người mới: menu 4 mục chính, tab con cho Tổng quan và Kế hoạch, lời chào theo giờ.
const HUBS=[
  {nav:'dashboard',tabs:[{id:'dashboard',label:'Tổng quan'},{id:'reports',label:'Báo cáo'}]},
  {nav:'budgets',tabs:[{id:'budgets',label:'Ngân sách'},{id:'goals',label:'Mục tiêu'},{id:'recurring',view:'planning',label:'Định kỳ'},{id:'bills',view:'planning',label:'Hóa đơn'},{id:'tags',view:'planning',label:'Nhãn'},{id:'household',view:'planning',label:'Gia đình'}]}
];
const VIEW_TITLES={transactions:'Giao dịch',reports:'Báo cáo',budgets:'Kế hoạch',goals:'Kế hoạch',planning:'Kế hoạch',insights:'Trợ lý',wallets:'Ví của tôi',categories:'Danh mục'};
function hubOf(view){return HUBS.find(hub=>hub.tabs.some(tab=>(tab.view||tab.id)===view))}
function greetingText(){const hour=new Date().getHours();return hour<11?'Chào buổi sáng':hour<14?'Chào buổi trưa':hour<18?'Chào buổi chiều':'Chào buổi tối'}
// Tên tiếng Việt gọi bằng tên riêng (chữ cuối); chưa có họ tên thì dùng tên đăng nhập.
function displayName(){const full=(state.user?.fullName||'').trim();return full?full.split(/\s+/).slice(-1)[0]:(state.user?.username||'bạn')}
function renderTitle(view){$('#page-title').innerHTML=view==='dashboard'?`${greetingText()}, <span id="user-name">${escapeHtml(displayName())}</span>`:escapeHtml(VIEW_TITLES[view]||'Sổ Mộc')}
function renderHubTabs(view){
  const hub=hubOf(view);const bar=$('#hub-tabs');bar.classList.toggle('hidden',!hub);if(!hub)return;
  const activeId=view==='planning'?(state.planningTab||'recurring'):view;
  bar.innerHTML=hub.tabs.map(tab=>`<button type="button" role="tab" aria-selected="${tab.id===activeId}" class="${tab.id===activeId?'active':''}" data-hub-tab="${tab.id}"${tab.view==='planning'?` data-planning-tab="${tab.id}"`:''}>${tab.label}</button>`).join('');
  $$('.nav-item').forEach(item=>{const current=item.dataset.view===hub.nav;item.classList.toggle('active',current);item.setAttribute('aria-current',current?'page':'false')});
}
$('#hub-tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-hub-tab]');if(!button)return;
  const tab=hubOf(state.currentView)?.tabs.find(item=>item.id===button.dataset.hubTab);if(!tab)return;
  if(tab.view==='planning'){selectPlanningTab(tab.id);if(state.currentView==='planning')renderHubTabs('planning');else showView('planning')}
  else showView(tab.id);
});
const layoutShowView=showView;
showView=function layoutAwareShowView(view,options={}){layoutShowView(view,options);renderTitle(state.currentView);renderHubTabs(state.currentView);scheduleViewTour(state.currentView)};

// Tổng quan của người chưa có dữ liệu: ẩn các khối 0 ₫, chỉ còn lời mời thiết lập.
$('#onboarding-card').insertAdjacentHTML('afterend','<section id="dashboard-empty" class="panel dashboard-empty hidden"><span class="eyebrow">BẮT ĐẦU</span><h2>Sổ của bạn đang trống</h2><p>Cho Sổ Mộc biết tiền của bạn đang ở đâu và ghi khoản đầu tiên. Mất khoảng 1 phút.</p><button class="primary-btn compact" type="button" data-welcome-open>Thiết lập nhanh</button></section>');
const layoutRender=render;
render=function layoutRender2(){
  layoutRender();
  const isNew=!state.wallets.some(wallet=>!wallet.archivedAt)&&!state.transactions.length;
  $('#view-dashboard').classList.toggle('is-new',isNew);
  $('#dashboard-empty').classList.toggle('hidden',!isNew||!$('#onboarding-card').classList.contains('hidden'));
  if(state.user)renderTitle(state.currentView);
};

// Ghi giao dịch: chưa có ví thì dẫn đi tạo ví; nhớ ví dùng lần trước; chọn nhanh danh mục bằng chip.
const LAST_WALLET_KEY='somoc_last_wallet';
function storageGet(key){try{return localStorage.getItem(key)}catch{return null}}
function storageSet(key,value){try{localStorage.setItem(key,value)}catch{/* trình duyệt chặn lưu trữ: bỏ qua */}}
function renderCategoryChips(){
  const type=document.querySelector('input[name="type"]:checked')?.value;const box=$('#tx-category-chips');
  if(type==='TRANSFER'){box.innerHTML='';return}
  const selected=$('#tx-category').value;
  box.innerHTML=state.categories.filter(item=>item.type===type&&!item.archivedAt).slice(0,10).map(item=>`<button type="button" class="chip${item.id===selected?' active':''}" data-tx-category="${item.id}">${escapeHtml(item.name)}</button>`).join('');
}
const layoutOpenModal=openModal;
openModal=function walletAwareOpenModal(transaction=null){
  if(!transaction&&!state.wallets.some(wallet=>!wallet.archivedAt)){toast('Bạn cần có ít nhất một ví trước khi ghi giao dịch.');openWelcome('wallet');return}
  layoutOpenModal(transaction);
  const last=storageGet(LAST_WALLET_KEY);
  if(!transaction&&last&&state.wallets.some(wallet=>wallet.id===last&&!wallet.archivedAt)){$('#tx-wallet').value=last;fillForm()}
  renderCategoryChips();
};
$$('input[name="type"]').forEach(input=>input.addEventListener('change',renderCategoryChips));
$('#tx-category').addEventListener('change',renderCategoryChips);
$('#tx-category-chips').addEventListener('click',event=>{const chip=event.target.closest('[data-tx-category]');if(!chip)return;$('#tx-category').value=$('#tx-category').value===chip.dataset.txCategory?'':chip.dataset.txCategory;renderCategoryChips()});
$('#transaction-form').addEventListener('submit',()=>{if($('#tx-wallet').value)storageSet(LAST_WALLET_KEY,$('#tx-wallet').value)});

// Giao dịch: bộ lọc tự áp dụng khi đổi lựa chọn, không cần bấm "Lọc".
['#transaction-type-filter','#transaction-wallet-filter','#transaction-category-filter','#transaction-from-filter','#transaction-to-filter'].forEach(selector=>$(selector).addEventListener('change',applyTransactionFilters));
$('#transaction-keyword-filter').addEventListener('search',applyTransactionFilters);

// Báo cáo: chọn nhanh kỳ; đổi ngày là tự tính lại, không còn nút "Xem báo cáo"/"Cập nhật".
function reportRange(kind){const now=new Date();const year=now.getFullYear(),month=now.getMonth();if(kind==='last-month')return[new Date(year,month-1,1),new Date(year,month,0)];if(kind==='3m')return[new Date(year,month-2,1),now];if(kind==='year')return[new Date(year,0,1),now];return[new Date(year,month,1),now]}
function reloadReports(){void loadReports();void refreshReportVisuals()}
$('#report-presets').addEventListener('click',event=>{const chip=event.target.closest('[data-report-range]');if(!chip)return;const[from,to]=reportRange(chip.dataset.reportRange);$('#report-from').value=localDateValue(from);$('#report-to').value=localDateValue(to);$$('#report-presets .chip').forEach(item=>item.classList.toggle('active',item===chip));reloadReports()});
['#report-from','#report-to'].forEach(selector=>$(selector).addEventListener('change',()=>{$$('#report-presets .chip').forEach(item=>item.classList.remove('active'));reloadReports()}));

// Mục tiêu: góp tiền từ một ví thật sang ví tiết kiệm của mục tiêu.
$('#goal-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-goal-action="contribute"]');if(!button)return;
  const goal=state.goals.find(item=>item.id===button.dataset.id);if(!goal)return;
  const sources=goal.walletId?state.wallets.filter(wallet=>!wallet.archivedAt&&wallet.id!==goal.walletId&&wallet.currency===(goal.wallet?.currency||wallet.currency)):[];
  $('#contribution-wallet').innerHTML=sources.map(wallet=>`<option value="${wallet.id}">${escapeHtml(wallet.name)} · ${moneyCurrency(wallet.balance,wallet.currency)}</option>`).join('')+'<option value="">Không chuyển tiền, chỉ ghi tiến độ</option>';
  $('#contribution-wallet-group').classList.toggle('hidden',!goal.walletId);
  $('#contribution-help').textContent=goal.walletId?`Sổ Mộc sẽ ghi một khoản chuyển tiền từ ví đã chọn sang ví “${goal.wallet?.name||'tiết kiệm'}”, nên số dư các ví luôn khớp với tiến độ.`:'Mục tiêu này chưa liên kết ví tiết kiệm nên lần góp chỉ ghi tiến độ, không trừ tiền ở ví nào. Sửa mục tiêu để chọn ví tiết kiệm.';
});

// Trợ lý: lời xin phép dùng AI gọn một dòng, chi tiết gửi gì nằm trong phần mở rộng.
renderAgentConsent=function compactAgentConsent(){
  const box=$('#agent-consent');box.classList.remove('hidden');
  if(!state.agentSettings?.externalAiEnabled){box.innerHTML='<span>Trợ lý AI chưa được cấu hình trên máy chủ này. Các chức năng khác vẫn dùng bình thường.</span>';return}
  const settings=state.agentSettings;const quota=settings.unlimited?'VIP · không giới hạn lượt hỏi':`Còn ${settings.remainingToday}/${settings.dailyLimit} lượt hôm nay`;
  box.innerHTML=settings.consent?`<span>✓ Đã cho phép ${escapeHtml(settings.provider)} xử lý nội dung chat. <b>${escapeHtml(quota)}</b></span><button id="agent-consent-toggle" class="text-btn" type="button">Thu hồi</button>`:`<span>Để trả lời, Trợ lý gửi nội dung chat và dữ liệu liên quan tới ${escapeHtml(settings.provider)}. <details class="agent-disclosure"><summary>Gửi những gì?</summary>${escapeHtml(settings.disclosure.join(', '))}. Không gửi mật khẩu, token hay khóa bí mật.</details> <b>${escapeHtml(quota)}</b></span><button id="agent-consent-toggle" class="primary-btn compact" type="button">Đồng ý dùng AI</button>`;
  $('#agent-consent-toggle').onclick=async()=>{try{const consent=!settings.consent;await api('/insights/settings',{method:'PUT',body:JSON.stringify({consent})});settings.consent=consent;renderAgentConsent();toast(consent?'Đã bật AI cho Trợ lý.':'Đã thu hồi quyền sử dụng AI.')}catch(error){toast(error.message,true)}};
};

// Slide thiết lập cho người mới: mỗi màn một câu hỏi, bấm chọn là xong, tạo dữ liệu thật ngay.
const WELCOME_INTERESTS=[
  {id:'track',icon:'🧾',title:'Biết tiền đi đâu',text:'Ghi thu chi, xem mình tiêu nhiều vào đâu'},
  {id:'budget',icon:'🎯',title:'Không chi quá tay',text:'Đặt hạn mức cho tháng hoặc từng nhóm'},
  {id:'save',icon:'🐷',title:'Tiết kiệm cho mục tiêu',text:'Mua xe, du lịch, quỹ dự phòng'},
  {id:'bills',icon:'📅',title:'Nhớ hóa đơn, khoản định kỳ',text:'Tiền nhà, điện nước, lương về'}
];
const WELCOME_WALLETS=[{type:'CASH',icon:'💵',name:'Tiền mặt'},{type:'BANK',icon:'🏦',name:'Tài khoản ngân hàng'},{type:'E_WALLET',icon:'📱',name:'Ví điện tử'}];
const WELCOME_CATEGORIES=[['Ăn uống','EXPENSE'],['Di chuyển','EXPENSE'],['Mua sắm','EXPENSE'],['Hóa đơn','EXPENSE'],['Sức khỏe','EXPENSE'],['Giải trí','EXPENSE'],['Lương','INCOME'],['Thu nhập khác','INCOME']];
const WELCOME_TIPS={
  track:{text:'Mỗi khi tiêu gì, bấm “＋ Ghi giao dịch”. Cuối tháng xem Tổng quan › Báo cáo.',view:'reports',label:'Xem Báo cáo'},
  budget:{text:'Đặt hạn mức chi tiêu ở Kế hoạch › Ngân sách.',view:'budgets',label:'Đặt ngân sách'},
  save:{text:'Tạo mục tiêu tiết kiệm ở Kế hoạch › Mục tiêu, nên kèm một ví tiết kiệm riêng.',view:'goals',label:'Tạo mục tiêu'},
  bills:{text:'Thêm tiền nhà, điện nước ở Kế hoạch › Hóa đơn để được nhắc trước hạn.',view:'planning',tab:'bills',label:'Thêm hóa đơn'}
};
let welcome=null;
function stepDone(id){return Boolean(state.onboarding?.steps?.find(step=>step.id===id)?.completed)}
function openWelcome(startAt){
  const pending=['wallet','categories','transaction'].filter(id=>!stepDone(id));
  const slides=startAt?pending.slice(Math.max(0,pending.indexOf(startAt))):['intro',...pending];
  const saved=state.onboarding?.interests;
  welcome={slides:[...slides,'done'],index:0,interests:new Set(Array.isArray(saved)?saved:[]),created:[]};
  if(!startAt&&!state.onboarding?.welcomeSeen)void setOnboardingPreference({welcomeSeen:true}).catch(()=>undefined);
  renderWelcome();openNamedModal('welcome-modal','#welcome-next');
}
function welcomeHeading(slide){const dataSlides=welcome.slides.filter(id=>!['intro','done'].includes(id));const index=dataSlides.indexOf(slide);return index<0?'':`BƯỚC ${index+1}/${dataSlides.length}`}
function renderWelcome(){
  const slide=welcome.slides[welcome.index];const box=$('#welcome-slide');const activeWallets=state.wallets.filter(wallet=>!wallet.archivedAt);
  $('#welcome-dots').innerHTML=welcome.slides.map((_,index)=>`<span class="${index===welcome.index?'active':index<welcome.index?'done':''}"></span>`).join('');
  if(slide==='intro'){
    const needName=!(state.user.fullName||'').trim();
    box.innerHTML=`<span class="eyebrow">CHÀO MỪNG ĐẾN SỔ MỘC</span><h2 id="welcome-title">Chào ${escapeHtml(needName?'bạn':displayName())}! Bạn muốn Sổ Mộc giúp gì?</h2><p class="form-help">Chọn một hoặc nhiều. Khoảng 1 phút nữa là sổ của bạn sẵn sàng.</p>${needName?'<label>Mình nên gọi bạn là gì?<input id="welcome-name" maxlength="120" autocomplete="name" placeholder="Ví dụ: Minh Anh"></label>':''}<div class="choice-grid">${WELCOME_INTERESTS.map(item=>`<button type="button" class="choice-card${welcome.interests.has(item.id)?' selected':''}" aria-pressed="${welcome.interests.has(item.id)}" data-interest="${item.id}"><span class="choice-icon" aria-hidden="true">${item.icon}</span><strong>${item.title}</strong><small>${item.text}</small></button>`).join('')}</div>`;
  }else if(slide==='wallet'){
    box.innerHTML=`<span class="eyebrow">${welcomeHeading(slide)} · NƠI GIỮ TIỀN</span><h2 id="welcome-title">Tiền của bạn đang ở đâu?</h2><p class="form-help">Mỗi nơi là một “ví”. Nhập số tiền đang có, ước chừng cũng được; sửa sau ở Thiết lập › Ví của tôi.</p><div class="wallet-choices">${WELCOME_WALLETS.map((item,index)=>`<label class="wallet-choice"><input type="checkbox" data-welcome-wallet="${item.type}"${index===0?' checked':''}><span class="choice-icon" aria-hidden="true">${item.icon}</span><span class="wallet-choice-name">${item.name}</span><span class="money-input"><input type="number" min="0" step="1000" inputmode="numeric" placeholder="0" data-welcome-balance="${item.type}" aria-label="Số tiền đang có trong ${item.name}"><span>₫</span></span></label>`).join('')}</div>`;
  }else if(slide==='categories'){
    const group=(type,title)=>`<strong class="chip-group-title">${title}</strong><div class="chip-row">${WELCOME_CATEGORIES.filter(item=>item[1]===type).map(([name])=>`<button type="button" class="chip active" aria-pressed="true" data-welcome-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div>`;
    box.innerHTML=`<span class="eyebrow">${welcomeHeading(slide)} · NHÓM THU CHI</span><h2 id="welcome-title">Bạn hay tiêu vào đâu?</h2><p class="form-help">Mỗi khoản thu chi thuộc một nhóm để báo cáo cho biết tiền đi đâu. Bỏ chọn nhóm không cần; thêm nhóm riêng sau ở Thiết lập › Danh mục.</p>${group('EXPENSE','Khoản chi')}${group('INCOME','Khoản thu')}`;
  }else if(slide==='transaction'){
    const expense=state.categories.filter(item=>item.type==='EXPENSE'&&!item.archivedAt);
    box.innerHTML=`<span class="eyebrow">${welcomeHeading(slide)} · GHI THỬ</span><h2 id="welcome-title">Ghi khoản chi đầu tiên</h2><p class="form-help">Hôm nay bạn đã tiêu gì? Chỉ cần số tiền và nhóm.</p><div class="money-input big"><input id="welcome-amount" type="number" min="1" step="1000" inputmode="numeric" placeholder="0" aria-label="Số tiền"><span>₫</span></div><div class="chip-row quick-amounts">${[20000,50000,100000,200000].map(value=>`<button type="button" class="chip" data-welcome-amount="${value}">${money(value)}</button>`).join('')}</div>${expense.length?`<strong class="chip-group-title">Nhóm</strong><div class="chip-row">${expense.map((item,index)=>`<button type="button" class="chip${index===0?' active':''}" data-welcome-tx-category="${item.id}">${escapeHtml(item.name)}</button>`).join('')}</div>`:''}<input id="welcome-note" maxlength="500" placeholder="Ghi chú (không bắt buộc), ví dụ: Ăn sáng">${activeWallets.length>1?`<label>Trả bằng ví<select id="welcome-wallet">${activeWallets.map(wallet=>`<option value="${wallet.id}">${escapeHtml(wallet.name)}</option>`).join('')}</select></label>`:''}`;
  }else{
    const tips=[...welcome.interests].map(id=>WELCOME_TIPS[id]).filter(Boolean);
    box.innerHTML=`<div class="welcome-done"><div class="welcome-badge" aria-hidden="true">✓</div><h2 id="welcome-title">Sổ của bạn đã sẵn sàng!</h2>${welcome.created.length?`<ul class="welcome-created">${welcome.created.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`:''}${tips.length?`<p class="form-help">Gợi ý theo điều bạn quan tâm:</p><div class="welcome-tips">${tips.map(tip=>`<div class="welcome-tip"><span>${escapeHtml(tip.text)}</span><button type="button" class="text-btn" data-welcome-go="${tip.view}"${tip.tab?` data-welcome-tab="${tip.tab}"`:''}>${escapeHtml(tip.label)} →</button></div>`).join('')}</div>`:''}<p class="form-help">Muốn biết mỗi nút nằm ở đâu? Đi một vòng giao diện, chừng 30 giây.</p></div>`;
  }
  const last=slide==='done';
  $('#welcome-back').classList.toggle('invisible',welcome.index===0||last);
  $('#welcome-skip').textContent=slide==='intro'?'Để sau':last?'Vào sổ ngay':'Bỏ qua bước này';
  $('#welcome-next').textContent=slide==='intro'?'Bắt đầu →':slide==='wallet'?'Tạo ví →':slide==='categories'?'Dùng các nhóm này →':slide==='transaction'?'Lưu khoản chi →':'Đi một vòng giao diện';
  requestAnimationFrame(()=>box.querySelector('input:not([type="checkbox"]),.choice-card')?.focus());
}
async function welcomeNext(){
  const slide=welcome.slides[welcome.index];
  if(slide==='intro'){
    const name=$('#welcome-name')?.value.trim();
    if(name){state.user=await api('/profile',{method:'PATCH',body:JSON.stringify({fullName:name})})}
    state.onboarding=await api('/profile/onboarding',{method:'PATCH',body:JSON.stringify({interests:[...welcome.interests],welcomeSeen:true})});
  }else if(slide==='wallet'){
    const chosen=WELCOME_WALLETS.filter(item=>$(`[data-welcome-wallet="${item.type}"]`).checked);
    if(!chosen.length){toast('Chọn ít nhất một nơi bạn đang giữ tiền.',true);return false}
    for(const item of chosen){await api('/wallets',{method:'POST',body:JSON.stringify({name:item.name,type:item.type,currency:state.user.currency||'VND',openingBalance:Number($(`[data-welcome-balance="${item.type}"]`).value||0)})})}
    welcome.created.push(`Tạo ${chosen.length} ví: ${chosen.map(item=>item.name).join(', ')}`);
  }else if(slide==='categories'){
    const names=$$('[data-welcome-category].active').map(chip=>chip.dataset.welcomeCategory);
    if(names.length){const result=await api('/profile/onboarding/starter-categories',{method:'POST',body:JSON.stringify({names})});if(result.created)welcome.created.push(`Tạo ${result.created} nhóm thu chi`)}
  }else if(slide==='transaction'){
    const amount=Number($('#welcome-amount').value);if(!(amount>0)){toast('Nhập số tiền, hoặc bấm “Bỏ qua bước này”.',true);$('#welcome-amount').focus();return false}
    const walletId=$('#welcome-wallet')?.value||state.wallets.find(wallet=>!wallet.archivedAt)?.id;
    await api('/transactions',{method:'POST',body:JSON.stringify({type:'EXPENSE',amount,walletId,categoryId:$('[data-welcome-tx-category].active')?.dataset.welcomeTxCategory||null,note:$('#welcome-note').value.trim()||null,occurredAt:new Date().toISOString()})});
    storageSet(LAST_WALLET_KEY,walletId);welcome.created.push(`Ghi khoản chi ${money(amount)}`);
  }else{closeNamedModal('welcome-modal');welcome=null;startTour('main',true);return false}
  if(slide!=='intro'){await loadData();render()}
  return true;
}
function welcomeAdvance(){welcome.index=Math.min(welcome.index+1,welcome.slides.length-1);renderWelcome()}
$('#welcome-next').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{if(await welcomeNext())welcomeAdvance()}catch(error){toast(error.message,true)}finally{button.disabled=false}});
$('#welcome-back').addEventListener('click',()=>{if(welcome.index>0){welcome.index-=1;renderWelcome()}});
$('#welcome-skip').addEventListener('click',()=>{const slide=welcome.slides[welcome.index];if(slide==='intro'||slide==='done'){closeNamedModal('welcome-modal');welcome=null;return}welcomeAdvance()});
$('#welcome-close').addEventListener('click',()=>{closeNamedModal('welcome-modal');welcome=null});
$('#welcome-slide').addEventListener('click',event=>{
  const interest=event.target.closest('[data-interest]');if(interest){const id=interest.dataset.interest;welcome.interests.has(id)?welcome.interests.delete(id):welcome.interests.add(id);interest.classList.toggle('selected');interest.setAttribute('aria-pressed',String(welcome.interests.has(id)))}
  const category=event.target.closest('[data-welcome-category]');if(category){category.classList.toggle('active');category.setAttribute('aria-pressed',String(category.classList.contains('active')))}
  const amount=event.target.closest('[data-welcome-amount]');if(amount){$('#welcome-amount').value=amount.dataset.welcomeAmount}
  const txCategory=event.target.closest('[data-welcome-tx-category]');if(txCategory)$$('[data-welcome-tx-category]').forEach(chip=>chip.classList.toggle('active',chip===txCategory));
  const go=event.target.closest('[data-welcome-go]');if(go){closeNamedModal('welcome-modal');welcome=null;if(go.dataset.welcomeTab)selectPlanningTab(go.dataset.welcomeTab);showView(go.dataset.welcomeGo)}
});
$('#welcome-slide').addEventListener('input',event=>{const type=event.target.dataset?.welcomeBalance;if(type&&event.target.value)$(`[data-welcome-wallet="${type}"]`).checked=true});
document.addEventListener('click',event=>{if(event.target.closest('[data-welcome-open]'))openWelcome()});
$('#restart-welcome').addEventListener('click',async()=>{try{state.onboarding=await api('/profile/onboarding',{method:'PATCH',body:JSON.stringify({restart:true})});storageSet(tourStorageKey(),'[]');closeNamedModal('profile-modal');render();openWelcome()}catch(error){toast(error.message,true)}});

// Hướng dẫn tại chỗ kiểu trò chơi: làm tối màn hình, chỉ sáng đúng nút cần biết, kèm một câu giải thích.
const TOURS={
  main:[
    {target:['#open-transaction','#mobile-add-transaction'],title:'Ghi một khoản thu chi',text:'Tiêu gì, nhận gì thì bấm đây. Chỉ cần số tiền và nhóm, chừng 5 giây.'},
    {target:'.nav-item[data-view="dashboard"]',title:'Tổng quan',text:'Tiền đang có và thu chi tháng này. Tab Báo cáo nằm ngay trong đây.'},
    {target:'.nav-item[data-view="transactions"]',title:'Giao dịch',text:'Xem lại, tìm, sửa hoặc xuất CSV mọi khoản đã ghi.'},
    {target:'.nav-item[data-view="budgets"]',title:'Kế hoạch',text:'Hạn mức chi tiêu, mục tiêu tiết kiệm, khoản định kỳ và hóa đơn: những thứ giúp bạn chủ động.'},
    {target:'.nav-item[data-view="insights"]',title:'Trợ lý',text:'Gõ tự nhiên như “ăn trưa 45k” là Trợ lý ghi giúp. Mọi thay đổi đều hỏi bạn trước.'},
    {target:'.nav-item[data-view="wallets"]',title:'Thiết lập',text:'Ví và danh mục: tạo một lần, ít khi phải sửa lại.'},
    {target:'#open-profile',title:'Hồ sơ và cài đặt',text:'Đổi tên, bảo mật, làm lại thiết lập. Xem lại hướng dẫn này ở “Hướng dẫn nhanh” cuối menu.'}
  ],
  transactions:[
    {target:'#transaction-keyword-filter',title:'Tìm nhanh',text:'Gõ từ khóa rồi Enter. Lọc theo ví, danh mục, ngày thì mở “Lọc thêm”.'},
    {target:'#export-csv',title:'Xuất CSV',text:'Tải danh sách đang hiển thị về máy, mở được bằng Excel.'}
  ],
  reports:[
    {target:'#report-presets',title:'Chọn kỳ báo cáo',text:'Bấm một kỳ hoặc đổi ngày, số liệu tự tính lại.'},
    {target:'#reconciliation-list',title:'Đối soát số dư',text:'Số dư từng ví theo sổ. Nếu khác số tiền thật, kiểm tra lại các giao dịch của ví đó.'},
    {target:'.report-export',title:'Tải về',text:'Xuất bảng tổng hợp hoặc đối soát dạng CSV.'}
  ],
  budgets:[
    {target:'#hub-tabs',title:'Các phần của Kế hoạch',text:'Ngân sách, Mục tiêu, Định kỳ, Hóa đơn… chuyển qua lại ở đây.'},
    {target:'#open-budget',title:'Đặt hạn mức',text:'Ví dụ: Ăn uống 3 triệu mỗi tháng. Thanh tiến độ cho biết còn được tiêu bao nhiêu.'}
  ],
  goals:[{target:'#open-goal',title:'Tạo mục tiêu tiết kiệm',text:'Đặt số tiền cần có và chọn một ví tiết kiệm; mỗi lần góp sẽ chuyển tiền thật vào ví đó.'}],
  planning:[{target:'#run-recurring',title:'Ghi các khoản đến hạn',text:'Bấm để ghi ngay những khoản định kỳ đã tới ngày.'}],
  insights:[{target:'#assistant-question',title:'Nói chuyện với Trợ lý',text:'Hỏi “tháng này tôi tiêu bao nhiêu?” hoặc nhờ “ghi 50k cà phê”. Trợ lý luôn cho xem trước để bạn xác nhận.'}]
};
let tour=null;let tourTimer=null;
function tourStorageKey(){return `somoc_tours_${state.user?.id||'guest'}`}
function seenTours(){try{return JSON.parse(storageGet(tourStorageKey())||'[]')}catch{return[]}}
function markTourSeen(id){storageSet(tourStorageKey(),JSON.stringify([...new Set([...seenTours(),id])]))}
// Kiểm thử tự động tắt hướng dẫn tự bật để lớp phủ không che các nút cần bấm.
function autoToursDisabled(){return storageGet('somoc_tours_off')==='1'}
function tourTarget(step){for(const selector of [].concat(step.target)){const element=$(selector);if(element&&element.getClientRects().length)return element}return null}
function startTour(id,force=false){
  if(!TOURS[id]||(!force&&seenTours().includes(id)))return;
  tour={id,index:0};$('#coach').classList.remove('hidden');$('#coach').setAttribute('aria-hidden','false');showTourStep();
}
function endTour(){if(!tour)return;markTourSeen(tour.id);tour=null;$('#coach').classList.add('hidden');$('#coach').setAttribute('aria-hidden','true');if(matchMedia('(max-width:950px)').matches)setSidebar(false)}
function showTourStep(){
  const steps=TOURS[tour.id];const step=steps[tour.index];if(!step){endTour();return}
  const inSidebar=[].concat(step.target).some(selector=>selector.startsWith('.nav-item'));const mobile=matchMedia('(max-width:950px)').matches;
  if(mobile)setSidebar(inSidebar);
  setTimeout(()=>{
    if(!tour)return;const element=tourTarget(step);
    if(!element){tour.index+=1;if(tour.index>=steps.length)endTour();else showTourStep();return}
    if(!element.closest('.sidebar,.topbar'))element.scrollIntoView({block:'center'});
    $('#coach-count').textContent=`${tour.index+1}/${steps.length}`;$('#coach-title').textContent=step.title;$('#coach-text').textContent=step.text;
    $('#coach-next').textContent=tour.index===steps.length-1?'Xong':'Tiếp';$('#coach-skip').classList.toggle('invisible',tour.index===steps.length-1);
    positionCoach();$('#coach-next').focus();
  },mobile?280:0);
}
function positionCoach(){
  if(!tour)return;const element=tourTarget(TOURS[tour.id][tour.index]);if(!element)return;
  const rect=element.getBoundingClientRect();const pad=6;const spot=$('.coach-spot');const bubble=$('.coach-bubble');
  Object.assign(spot.style,{left:`${rect.left-pad}px`,top:`${rect.top-pad}px`,width:`${rect.width+pad*2}px`,height:`${rect.height+pad*2}px`});
  const width=Math.min(320,innerWidth-24);bubble.style.width=`${width}px`;const height=bubble.offsetHeight;
  const below=rect.bottom+pad+14+height<=innerHeight;const beside=rect.right+pad+14+width<=innerWidth&&rect.left<innerWidth/3;
  let left=beside?rect.right+pad+14:rect.left+rect.width/2-width/2;let top=beside?rect.top+rect.height/2-height/2:below?rect.bottom+pad+14:rect.top-pad-14-height;
  left=Math.max(12,Math.min(left,innerWidth-width-12));top=Math.max(12,Math.min(top,innerHeight-height-12));
  Object.assign(bubble.style,{left:`${left}px`,top:`${top}px`});
}
function scheduleViewTour(view){
  clearTimeout(tourTimer);
  if(!TOURS[view]||view==='main'||autoToursDisabled()||!state.onboarding?.welcomeSeen||seenTours().includes(view))return;
  tourTimer=setTimeout(()=>{if(!tour&&state.currentView===view&&!$('.modal:not(.hidden)'))startTour(view)},700);
}
$('#coach-next').addEventListener('click',()=>{tour.index+=1;if(tour.index>=TOURS[tour.id].length)endTour();else showTourStep()});
$('#coach-skip').addEventListener('click',endTour);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&tour)endTour()});
window.addEventListener('resize',positionCoach);window.addEventListener('scroll',positionCoach,true);
$('#open-help').addEventListener('click',()=>{setSidebar(false);startTour('main',true)});
