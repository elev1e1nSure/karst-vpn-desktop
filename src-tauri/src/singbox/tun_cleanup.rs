#[cfg(windows)]
mod platform {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    use windows_sys::core::GUID;
    use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW,
        SetupDiGetDeviceRegistryPropertyW, SetupDiRemoveDevice, DIGCF_PRESENT, SPDRP_FRIENDLYNAME,
        SP_DEVINFO_DATA,
    };
    use windows_sys::Win32::Foundation::{
        GetLastError, ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_ITEMS,
    };

    const GUID_DEVCLASS_NET: GUID = GUID {
        data1: 0x4d36e972,
        data2: 0xe325,
        data3: 0x11ce,
        data4: [0xbf, 0xc1, 0x08, 0x00, 0x2b, 0xe1, 0x03, 0x18],
    };

    pub fn remove_adapter_if_exists(adapter_name: &str) {
        let device_info_set = unsafe {
            SetupDiGetClassDevsW(
                &GUID_DEVCLASS_NET,
                std::ptr::null(),
                std::ptr::null_mut(),
                DIGCF_PRESENT,
            )
        };

        if device_info_set as isize == -1 {
            return;
        }

        let mut device_index = 0u32;
        loop {
            let mut device_data: SP_DEVINFO_DATA = unsafe { std::mem::zeroed() };
            device_data.cbSize = std::mem::size_of::<SP_DEVINFO_DATA>() as u32;

            let result =
                unsafe { SetupDiEnumDeviceInfo(device_info_set, device_index, &mut device_data) };
            if result == 0 {
                let error = unsafe { GetLastError() };
                if error == ERROR_NO_MORE_ITEMS {
                    break;
                }
                device_index += 1;
                continue;
            }

            let mut required_size = 0u32;
            unsafe {
                SetupDiGetDeviceRegistryPropertyW(
                    device_info_set,
                    &device_data,
                    SPDRP_FRIENDLYNAME,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    0,
                    &mut required_size,
                );
            }

            let error = unsafe { GetLastError() };
            if error != ERROR_INSUFFICIENT_BUFFER || required_size == 0 {
                device_index += 1;
                continue;
            }

            let mut buffer: Vec<u8> = vec![0u8; required_size as usize];
            let result = unsafe {
                SetupDiGetDeviceRegistryPropertyW(
                    device_info_set,
                    &device_data,
                    SPDRP_FRIENDLYNAME,
                    std::ptr::null_mut(),
                    buffer.as_mut_ptr(),
                    required_size,
                    std::ptr::null_mut(),
                )
            };

            if result == 0 {
                device_index += 1;
                continue;
            }

            let wide_slice = unsafe {
                std::slice::from_raw_parts(
                    buffer.as_ptr() as *const u16,
                    required_size as usize / std::mem::size_of::<u16>(),
                )
            };
            let len = wide_slice.iter().position(|&c| c == 0).unwrap_or(0);
            let name = OsString::from_wide(&wide_slice[..len]);

            if name.to_string_lossy().as_ref() == adapter_name {
                unsafe {
                    SetupDiRemoveDevice(device_info_set, &mut device_data);
                }
            }

            device_index += 1;
        }

        unsafe {
            SetupDiDestroyDeviceInfoList(device_info_set);
        }
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn remove_adapter_if_exists(_adapter_name: &str) {}
}

pub use platform::remove_adapter_if_exists;
