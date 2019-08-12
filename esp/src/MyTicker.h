/* 
  Ticker.h - esp8266 library that calls functions periodically

  Copyright (c) 2014 Ivan Grokhotkov. All rights reserved.
  This file is part of the esp8266 core for Arduino environment.
 
  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.

  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public
  License along with this library; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/

#include <stdint.h>
#include <stdbool.h>
#include <functional>
#include <Schedule.h>

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h> // time() ctime()
#include <sys/time.h>
#include <coredecls.h>
#include <Ticker.h>

#include <ESP8266WiFi.h>


class MyTicker
{
public:
    MyTicker();
    ~MyTicker();
    typedef void (*callback_t)(void);
    typedef void (*cb_with_arg_t)(void*);
    typedef std::function<void(void)> cb_function_t;

    void attach(long seconds, cb_function_t callback)
    {
        _seconds=seconds;
        _armed=false;
        _callback_function = callback;
        attach(seconds, _static_callback, (void*)this);
    }

        template<typename TArg>
    void attach(long seconds, void (*callback)(TArg), TArg arg)
    {
        //static_assert(sizeof(TArg) <= sizeof(uint32_t), "attach() callback argument size must be <= 4 bytes");
        // C-cast serves two purposes:
        // static_cast for smaller integer types,
        // reinterpret_cast + const_cast for pointer types
        uint32_t arg32 = (uint32_t)arg;
        _attach_ms(seconds, callback, arg32);
    }


    void detach();
    bool armed();
    void run();

//    char _debugMsg[255];

protected:  
    void _attach_ms(long seconds, cb_with_arg_t callback, uint32_t arg);
    static void _static_callback (void* arg);


protected:
    Ticker _timer;
    unsigned long _seconds;
    unsigned long _last_called;
    bool _armed;
    cb_function_t _callback_function = nullptr;
};
