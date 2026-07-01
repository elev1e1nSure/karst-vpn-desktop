
class Component extends DCLogic {
  state = {
    phase: 'off', elapsed: 0, showBurst: false, showFadeOut: false,
    menuVisible: false, menuClosing: false, selectedServerId: 'frankfurt',
    customServers: [], addServerOpen: false, addServerClosing: false, addServerValue: '', addServerError: '',
    settingsVisible: false, settingsClosing: false,
    darkModeOn: null, killSwitch: true, autoConnect: false, notifications: true, protocol: 'vless',
  };

  protocolList = [
    { id: 'vless', label: 'VLESS' },
    { id: 'wireguard', label: 'WireGuard' },
    { id: 'shadowsocks', label: 'Shadowsocks' },
  ];

  servers = [
    { id: 'frankfurt', name: 'Франкфурт, Германия', tag: 'Самый быстрый сервер' },
    { id: 'amsterdam', name: 'Амстердам, Нидерланды', tag: '12 мс' },
    { id: 'stockholm', name: 'Стокгольм, Швеция', tag: '24 мс' },
    { id: 'zurich', name: 'Цюрих, Швейцария', tag: '31 мс' },
    { id: 'lisbon', name: 'Лиссабон, Португалия', tag: '47 мс' },
  ];

  componentWillUnmount() {
    if (this._timer) clearInterval(this._timer);
    if (this._connectTimeout) clearTimeout(this._connectTimeout);
    if (this._burstTimeout) clearTimeout(this._burstTimeout);
    if (this._fadeOutTimeout) clearTimeout(this._fadeOutTimeout);
    if (this._menuCloseTimeout) clearTimeout(this._menuCloseTimeout);
    if (this._settingsCloseTimeout) clearTimeout(this._settingsCloseTimeout);
    if (this._addServerCloseTimeout) clearTimeout(this._addServerCloseTimeout);
  }

  onOpenServerMenu = () => {
    if (this.state.menuVisible) return;
    this.setState({ menuVisible: true, menuClosing: false });
  };

  onCloseServerMenu = () => {
    if (!this.state.menuVisible || this.state.menuClosing) return;
    this.setState({ menuClosing: true });
    this._menuCloseTimeout = setTimeout(() => {
      this.setState({ menuVisible: false, menuClosing: false });
    }, 320);
  };

  onSelectServer = (id) => {
    this.setState({ selectedServerId: id });
    this.onCloseServerMenu();
  };

  onOpenAddServer = () => this.setState({ addServerOpen: true, addServerError: '' });

  closeAddServerForm = () => {
    this.setState({ addServerOpen: false, addServerValue: '', addServerError: '' });
  };

  onCancelAddServer = () => this.closeAddServerForm();
  onChangeAddServerValue = (e) => this.setState({ addServerValue: e.target.value, addServerError: '' });

  parseVless(raw) {
    const str = (raw || '').trim();
    if (!str.toLowerCase().startsWith('vless://')) return null;
    const m = str.match(/^vless:\/\/([^@]+)@([^:/?#]+):(\d+)/i);
    if (!m) return null;
    const host = m[2];
    const port = m[3];
    let remark = '';
    const hashIdx = str.indexOf('#');
    if (hashIdx !== -1) {
      try { remark = decodeURIComponent(str.slice(hashIdx + 1)); } catch (e) { remark = str.slice(hashIdx + 1); }
    }
    return { host, port, name: remark || host };
  }

  onSubmitAddServer = () => {
    const parsed = this.parseVless(this.state.addServerValue);
    if (!parsed) {
      this.setState({ addServerError: 'Не похоже на vless:// ссылку — проверь формат' });
      return;
    }
    const id = 'custom-' + Date.now();
    const newServer = { id, name: parsed.name, tag: `VLESS · ${parsed.host}:${parsed.port}`, isCustom: true };
    this.setState(s => ({
      customServers: [...s.customServers, newServer],
      selectedServerId: id,
    }));
    this.closeAddServerForm();
  };

  onOpenSettings = () => {
    if (this.state.settingsVisible) return;
    this.setState({ settingsVisible: true, settingsClosing: false });
  };

  onCloseSettings = () => {
    if (!this.state.settingsVisible || this.state.settingsClosing) return;
    this.setState({ settingsClosing: true });
    this._settingsCloseTimeout = setTimeout(() => {
      this.setState({ settingsVisible: false, settingsClosing: false });
    }, 320);
  };

  onToggleDarkMode = () => this.setState(s => ({ darkModeOn: !(s.darkModeOn ?? (this.props.darkMode ?? true)) }));
  onToggleKillSwitch = () => this.setState(s => ({ killSwitch: !s.killSwitch }));
  onToggleAutoConnect = () => this.setState(s => ({ autoConnect: !s.autoConnect }));
  onToggleNotifications = () => this.setState(s => ({ notifications: !s.notifications }));
  onSelectProtocol = (id) => this.setState({ protocol: id });

  onRemoveServer = (id, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    this.setState(s => ({
      customServers: s.customServers.filter(srv => srv.id !== id),
      selectedServerId: s.selectedServerId === id ? 'frankfurt' : s.selectedServerId,
    }));
  };

  onTapButton = () => {
    const { phase } = this.state;
    if (phase === 'off') {
      this.setState({ phase: 'connecting' });
      this._connectTimeout = setTimeout(() => {
        this.setState({ phase: 'on', elapsed: 0, showBurst: true });
        this._timer = setInterval(() => {
          this.setState(s => ({ elapsed: s.elapsed + 1 }));
        }, 1000);
        this._burstTimeout = setTimeout(() => this.setState({ showBurst: false }), 600);
      }, 1300);
    } else if (phase === 'on') {
      if (this._timer) clearInterval(this._timer);
      this.setState({ phase: 'off', elapsed: 0, showFadeOut: true });
      this._fadeOutTimeout = setTimeout(() => this.setState({ showFadeOut: false }), 400);
    }
    // taps ignored while connecting
  };

  formatElapsed(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  renderVals() {
    const {
      phase, elapsed, showBurst, showFadeOut, menuVisible, menuClosing, selectedServerId, customServers, addServerOpen, addServerClosing, addServerValue, addServerError,
      settingsVisible, settingsClosing, darkModeOn, killSwitch, autoConnect, notifications, protocol,
    } = this.state;
    const isConnecting = phase === 'connecting';
    const isConnected = phase === 'on';

    const dark = darkModeOn ?? (this.props.darkMode ?? true);
    const accent = this.props.accentColor ?? '#CC785C';
    const moodKey = this.props.mood ?? 'calm';

    const theme = dark
      ? {
          pageBg: '#1b1a18',
          appBg: '#211f1c',
          cardBg: '#28251f',
          ink: 'oklch(94% 0.01 75)',
          mutedInk: 'oklch(64% 0.015 60)',
          border: '#34302a',
          buttonOffBg: '#28251f',
          buttonOffBorder: '#3a352d',
          buttonOffIcon: 'oklch(70% 0.012 60)',
          pillOffBg: '#28251f',
          pillOffDot: 'oklch(60% 0.012 60)',
          pillOffText: 'oklch(68% 0.012 60)',
        }
      : {
          pageBg: 'oklch(91% 0.012 75)',
          appBg: 'oklch(95% 0.012 75)',
          cardBg: 'oklch(98% 0.006 75)',
          ink: 'oklch(22% 0.02 50)',
          mutedInk: 'oklch(50% 0.015 50)',
          border: 'oklch(89% 0.01 75)',
          buttonOffBg: 'oklch(98% 0.006 75)',
          buttonOffBorder: 'oklch(86% 0.01 75)',
          buttonOffIcon: 'oklch(45% 0.02 50)',
          pillOffBg: 'oklch(91% 0.012 75)',
          pillOffDot: 'oklch(55% 0.015 50)',
          pillOffText: 'oklch(45% 0.015 50)',
        };

    const moodMap = {
      calm: { ringDuration: '2.3s', iconStroke: '1.9', chipRadius: '16px', subOff: 'Нажми на кнопку, чтобы защититься', subConnecting: 'Устанавливаем безопасное соединение' },
      focused: { ringDuration: '1.7s', iconStroke: '2.2', chipRadius: '14px', subOff: 'Готов к подключению', subConnecting: 'Настраиваем туннель' },
      urgent: { ringDuration: '1s', iconStroke: '2.6', chipRadius: '10px', subOff: 'Защита выключена — нажми сейчас', subConnecting: 'Срочно шифруем соединение' },
    };
    const mood = moodMap[moodKey] || moodMap.calm;

    let buttonBg, buttonShadow, iconColor, border;
    const offShadowDark = dark ? '0,0,0' : '0,0,0';
    if (isConnected) {
      buttonBg = accent;
      buttonShadow = `0 0 0 8px color-mix(in oklch, ${accent} 16%, transparent), 0 16px 32px -10px color-mix(in oklch, ${accent} 55%, transparent)`;
      iconColor = '#fff';
      border = 'none';
    } else if (isConnecting) {
      buttonBg = theme.buttonOffBg;
      buttonShadow = `0 0 0 0px transparent, 0 16px 32px -10px rgba(${offShadowDark},0.25)`;
      iconColor = accent;
      border = `1.5px solid ${accent}`;
    } else {
      buttonBg = theme.buttonOffBg;
      buttonShadow = `0 0 0 0px transparent, 0 16px 32px -10px rgba(${offShadowDark},0.3)`;
      iconColor = theme.buttonOffIcon;
      border = `1.5px solid ${theme.buttonOffBorder}`;
    }

    const buttonAnim = showBurst ? 'buttonConnectPulse 0.4s cubic-bezier(0.4,0,0.2,1) both' : showFadeOut ? 'buttonDisconnectPulse 0.4s cubic-bezier(0.4,0,0.2,1) both' : 'none';
    const buttonStyle = `width:152px;height:152px;border-radius:50%;background:${buttonBg};border:${border};box-shadow:${buttonShadow};display:flex;align-items:center;justify-content:center;cursor:${isConnecting ? 'default' : 'pointer'};outline:none;-webkit-tap-highlight-color:transparent;animation:${buttonAnim};transition:border-color 0.4s cubic-bezier(0.4,0,0.2,1), box-shadow 0.4s cubic-bezier(0.4,0,0.2,1);`;
    const buttonStyleActive = `transform:scale(0.97);`;

    const statusLabel = isConnected ? 'Подключено' : isConnecting ? 'Подключаемся…' : 'Не подключено';
    const subLabel = isConnecting ? mood.subConnecting : mood.subOff;

    const pill = isConnected
      ? { bg: `color-mix(in oklch, ${accent} 16%, transparent)`, dot: accent, text: accent, label: 'Защищено' }
      : isConnecting
      ? { bg: theme.pillOffBg, dot: theme.pillOffDot, text: theme.pillOffText, label: 'Подключение' }
      : { bg: theme.pillOffBg, dot: theme.pillOffDot, text: theme.pillOffText, label: 'Не защищено' };

    const allServers = [...this.servers, ...customServers];
    const selectedServer = allServers.find(s => s.id === selectedServerId) || this.servers[0];
    const servers = allServers.map(s => ({
      ...s,
      isSelected: s.id === selectedServerId,
      dotColor: s.id === selectedServerId ? accent : theme.border,
      onSelect: () => this.onSelectServer(s.id),
      onRemove: (e) => this.onRemoveServer(s.id, e),
    }));
    const menuAnim = `${menuClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.38s cubic-bezier(0.4,0,0.2,1) both`;
    const backdropAnim = `${menuClosing ? 'backdropOut' : 'backdropIn'} 0.32s cubic-bezier(0.4,0,0.2,1) both`;
    const settingsAnim = `${settingsClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.38s cubic-bezier(0.4,0,0.2,1) both`;
    const settingsBackdropAnim = `${settingsClosing ? 'backdropOut' : 'backdropIn'} 0.32s cubic-bezier(0.4,0,0.2,1) both`;

    const switchTrack = (on) => on ? `color-mix(in oklch, ${accent} 70%, transparent)` : theme.border;
    const switchKnob = (on) => on ? '21px' : '3px';

    const showAddServerForm = addServerOpen;
    const showAddServerButton = !addServerOpen;

    const protocols = this.protocolList.map(p => {
      const isSelected = p.id === protocol;
      return {
        ...p,
        bg: isSelected ? `color-mix(in oklch, ${accent} 16%, transparent)` : theme.cardBg,
        border: isSelected ? accent : theme.border,
        text: isSelected ? accent : theme.mutedInk,
        onSelect: () => this.onSelectProtocol(p.id),
      };
    });

    return {
      isOff: phase === 'off',
      isConnecting,
      isConnected,
      showRing: isConnected,
      showBurst,
      showFadeOut,
      statusLabel,
      subLabel,
      elapsedLabel: this.formatElapsed(elapsed),
      buttonStyle,
      buttonStyleActive,
      iconColor,
      pill,
      theme,
      mood,
      accent,
      onTapButton: this.onTapButton,
      menuVisible,
      menuClosing,
      menuAnim,
      backdropAnim,
      selectedServer,
      servers,
      onOpenServerMenu: this.onOpenServerMenu,
      onCloseServerMenu: this.onCloseServerMenu,
      addServerOpen,
      addServerValue,
      addServerError,
      showAddServerForm,
      showAddServerButton,
      onOpenAddServer: this.onOpenAddServer,
      onCancelAddServer: this.onCancelAddServer,
      onChangeAddServerValue: this.onChangeAddServerValue,
      onSubmitAddServer: this.onSubmitAddServer,
      settingsVisible,
      settingsAnim,
      settingsBackdropAnim,
      onOpenSettings: this.onOpenSettings,
      onCloseSettings: this.onCloseSettings,
      protocols,
      darkModeTrack: switchTrack(dark),
      darkModeKnob: switchKnob(dark),
      onToggleDarkMode: this.onToggleDarkMode,
      killSwitchTrack: switchTrack(killSwitch),
      killSwitchKnob: switchKnob(killSwitch),
      onToggleKillSwitch: this.onToggleKillSwitch,
      autoConnectTrack: switchTrack(autoConnect),
      autoConnectKnob: switchKnob(autoConnect),
      onToggleAutoConnect: this.onToggleAutoConnect,
      notificationsTrack: switchTrack(notifications),
      notificationsKnob: switchKnob(notifications),
      onToggleNotifications: this.onToggleNotifications,
    };
  }
}

